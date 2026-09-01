# AndroidManifest.xml — Kiosk Mode Required Additions

Because `android/app/src/main/AndroidManifest.xml` is shared across features,
this patch document describes **exactly what must be added** rather than
overwriting the whole file. Apply these additions in the listed locations.

---

## 1. Permissions (add inside `<manifest>`, before `<application>`)

```xml
<!-- Allows the app to receive a broadcast when the device boots,
     so kiosk mode can be re-applied after a reboot. -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Required to start KioskForegroundService on Android 9+ (API 28+). -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

---

## 2. DeviceAdminReceiver (add inside `<application>`)

Required for Device Owner / LockTaskMode path. Without a registered
`DeviceAdminReceiver`, `DevicePolicyManager.isDeviceOwnerApp()` always
returns `false` and the module falls back to screen-pinning.

```xml
<receiver
    android:name=".DeviceAdminReceiver"
    android:permission="android.permission.BIND_DEVICE_ADMIN"
    android:exported="true">
    <meta-data
        android:name="android.app.device_admin"
        android:resource="@xml/device_admin_policies" />
    <intent-filter>
        <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
    </intent-filter>
</receiver>
```

> **Companion files to create:**
> - `android/app/src/main/res/xml/device_admin_policies.xml` (see below)
> - `android/app/src/main/java/com/virtualdoorman/DeviceAdminReceiver.kt`
>   (minimal stub extending `android.app.admin.DeviceAdminReceiver`)

### `res/xml/device_admin_policies.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<device-admin>
    <uses-policies>
        <force-lock />
        <reset-password />
    </uses-policies>
</device-admin>
```

---

## 3. KioskForegroundService declaration (add inside `<application>`)

```xml
<service
    android:name=".kiosk.KioskForegroundService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

> `foregroundServiceType` became mandatory on Android 14 (API 34).
> `dataSync` is accepted for a keep-alive service; adjust to a more
> specific type (e.g. `camera`, `location`) if the project requires it.

---

## 4. MainActivity adjustments (modify the existing `<activity>` block)

Add or change these attributes on `<activity android:name=".MainActivity" ...>`:

```xml
android:launchMode="singleTask"
android:showWhenLocked="true"
android:turnScreenOn="true"
```

| Attribute | Reason |
|---|---|
| `singleTask` | Prevents a second Activity instance from launching via a notification tap or implicit intent |
| `showWhenLocked` | The kiosk screen is visible above the lock screen (door-entry tablets may sleep) |
| `turnScreenOn` | Wakes the display when the app restarts from boot or from a remote command |

---

## 5. Boot receiver (add inside `<application>`)

So the app can re-enter kiosk mode after a device reboot:

```xml
<receiver
    android:name=".kiosk.BootReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</receiver>
```

> **Stub `BootReceiver.kt`** should read a persisted preference to check
> whether kiosk was active before the reboot, then start
> `KioskForegroundService` and re-launch `MainActivity` with the kiosk flag.

---

## Summary checklist

| What | Location | Done? |
|---|---|---|
| `RECEIVE_BOOT_COMPLETED` permission | `<manifest>` | ☐ |
| `FOREGROUND_SERVICE` permission | `<manifest>` | ☐ |
| `DeviceAdminReceiver` declaration | `<application>` | ☐ |
| `device_admin_policies.xml` resource | `res/xml/` | ☐ |
| `DeviceAdminReceiver.kt` stub | `kiosk/` package | ☐ |
| `KioskForegroundService` service declaration | `<application>` | ☐ |
| `MainActivity` — `singleTask`, `showWhenLocked`, `turnScreenOn` | existing `<activity>` | ☐ |
| `BootReceiver` declaration | `<application>` | ☐ |
| `BootReceiver.kt` stub | `kiosk/` package | ☐ |
