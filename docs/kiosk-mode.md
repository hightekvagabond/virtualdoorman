# Kiosk Mode — Android Lockdown

This document covers how Virtual Doorman locks a tablet to a single-app
kiosk experience and how that lock is released.

---

## Table of contents

1. [LockTaskMode vs screen pinning](#1-locktaskmode-vs-screen-pinning)
2. [Setting the app as Device Owner](#2-setting-the-app-as-device-owner)
3. [System UI suppression](#3-system-ui-suppression)
4. [Foreground service](#4-foreground-service)
5. [Unlock flow — Admin PIN](#5-unlock-flow--admin-pin)
6. [Recovery command flow (S3)](#6-recovery-command-flow-s3-stub)
7. [Quick-reference adb commands](#7-quick-reference-adb-commands)

---

## 1. LockTaskMode vs screen pinning

### LockTaskMode (preferred — Device Owner)

Available on Android 5.0+ (API 21). When the app holds the **Device Owner**
role, `Activity.startLockTask()` enters fully managed lock mode:

| What is blocked | Detail |
|---|---|
| **Back button** | Suppressed entirely by the OS |
| **Home button** | Suppressed entirely |
| **Recents / Overview** | Suppressed entirely |
| **Notification shade** | Pull-down gesture is intercepted and ignored |
| **Status bar** | Hidden (no clock, no icons) |
| **OS kill** | `START_STICKY` foreground service prevents eviction |

This is the **production path**. It requires the app to be provisioned as
Device Owner before the tablet reaches a guest (one-time adb setup; see §2).

### Screen-pinning fallback (non-Device-Owner / first sideload)

If the app is not Device Owner, `startLockTask()` triggers the system
**screen-pinning** dialog. After the guest (or installer) confirms:

| What is blocked | Detail |
|---|---|
| **Home button** | Blocked |
| **Recents** | Blocked |
| **Back button** | **Not blocked** — a determined guest can press Back to exit |
| **Notification shade** | Still accessible |

The fallback is acceptable for demos and development but **not for production**.
Provisioning the Device Owner role (§2) must happen before any guest-facing
deployment.

---

## 2. Setting the app as Device Owner

Device Owner can only be set on an **unprovisioned** device (factory-reset
or freshly flashed, with no Google account added).

```bash
# 1. Factory-reset the tablet.
# 2. Complete the Android setup wizard but DO NOT add a Google account.
# 3. Enable USB debugging (Settings > Developer options).
# 4. Connect via USB and run:

adb shell dpm set-device-owner com.virtualdoorman/.DeviceAdminReceiver
```

Expected success output:
```
Success: Device owner set to package com.virtualdoorman
```

**Key constraints:**
- The device must have **zero accounts** configured at the time this
  command runs. If it fails with `IllegalStateException`, factory-reset
  and try again.
- Once set, Device Owner can only be removed by a factory reset or by
  calling `DevicePolicyManager.clearDeviceOwnerApp()` programmatically
  (which also clears all managed configurations).
- `DeviceAdminReceiver` must be declared in `AndroidManifest.xml` and the
  `device_admin_policies.xml` resource must exist — see
  `docs/android-manifest-kiosk-patch.md`.

---

## 3. System UI suppression

`KioskModule.lock()` applies these window flags on the Activity UI thread
before calling `startLockTask()`:

| Flag | Effect |
|---|---|
| `SYSTEM_UI_FLAG_FULLSCREEN` | Hides the status bar (clock, battery, etc.) |
| `SYSTEM_UI_FLAG_HIDE_NAVIGATION` | Hides the navigation bar |
| `SYSTEM_UI_FLAG_IMMERSIVE_STICKY` | Re-hides bars automatically if they briefly appear after an edge swipe |
| `SYSTEM_UI_FLAG_LAYOUT_STABLE` | Prevents layout reflowing when bars are toggled |
| `SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN` | App draws under the status bar area |
| `SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION` | App draws under the nav bar area |
| `FLAG_KEEP_SCREEN_ON` | Display stays on indefinitely (door-entry use case) |

These must be **reapplied on every `onWindowFocusChanged(hasFocus=true)`**
call. The foreground service keeps the process alive, but if you override
`onWindowFocusChanged` or `onResume` in `MainActivity`, re-apply the flags
there.

---

## 4. Foreground service

`KioskForegroundService` posts a silent, ongoing notification that tells
Android the app is performing user-visible work:

- Keeps the process in the **foreground OOM priority bucket**, preventing
  eviction under memory pressure.
- Uses `START_STICKY` so Android restarts it automatically if the OS
  kills it in an extreme low-memory scenario.
- The notification is `IMPORTANCE_LOW` (no sound, no heads-up banner)
  and `VISIBILITY_SECRET` (hidden from the lock screen).

Lifecycle:
- **Started** inside `KioskModule.lock()`
- **Stopped** inside `KioskModule.unlock()`

---

## 5. Unlock flow — Admin PIN

Admin PIN UI and verification are implemented in a separate ticket.
The kiosk module exposes a `kioskUnlock()` stub that the PIN flow calls:

```typescript
import { kioskUnlock } from 'src/native/KioskModule';

// After PIN is verified:
await kioskUnlock();
navigation.navigate('AdminPanel');
```

Or via the React hook (preferred):

```typescript
import { useKioskMode } from 'src/hooks/useKioskMode';

function KioskRootScreen() {
  const { locked, requestUnlock } = useKioskMode({
    enabled: true,
    onUnlockRequest: () => navigation.navigate('AdminPanel'),
  });

  // Pass requestUnlock to the Admin PIN component:
  return <AdminPinOverlay onPinVerified={requestUnlock} />;
}
```

`requestUnlock()` throws on native error; wrap calls in try/catch and
show an appropriate alert to the operator.

---

## 6. Recovery command flow (S3 — stub)

> **This section describes a stub.** The full implementation is in the
> S3 commands ticket.

The recovery path allows a remote operator to unlock a stuck tablet
without physical access:

1. Operator uploads a signed JSON command to:
   `s3://<bucket>/commands/<device-id>/unlock.json`
2. The app polls the `commands/<device-id>/` prefix at a configurable
   interval (default: 60 s) while kiosk mode is active.
3. On receiving a valid signed `unlock` command the app calls
   `kioskUnlock()` and navigates to AdminPanel.
4. The command file is deleted (or flagged as consumed) after processing
   to prevent replay attacks.

Signing scheme and S3 integration details are specified in the
S3-commands ticket. Wire in via `kioskUnlock()` exactly as the PIN flow.

---

## 7. Quick-reference adb commands

```bash
# Check current Device Owner
adb shell dpm list-owners

# Set Device Owner (one-time, unprovisioned device only)
adb shell dpm set-device-owner com.virtualdoorman/.DeviceAdminReceiver

# Force-exit LockTaskMode from host (debug / emergency recovery)
adb shell am task lock stop

# Check whether screen-pinning is enabled (for fallback path)
adb shell settings get secure lock_to_app_enabled
# Output: 1 = enabled, 0 = disabled

# Enable screen-pinning without touching the Settings UI
adb shell settings put secure lock_to_app_enabled 1

# Manually start / stop the foreground service
adb shell am start-service com.virtualdoorman/.kiosk.KioskForegroundService
adb shell am stop-service  com.virtualdoorman/.kiosk.KioskForegroundService

# Verify the app is in LockTaskMode
adb shell dumpsys activity | grep -i locktask

# Simulate a boot broadcast (to test BootReceiver)
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED \
    -p com.virtualdoorman
```
