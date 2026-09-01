/**
 * KioskModule.ts
 *
 * TypeScript bridge to the native Android KioskModule.
 *
 * On non-Android platforms (iOS simulator, macOS dev) calls are shimmed
 * to no-ops so the JS bundle does not crash during development.
 *
 * Usage:
 *   import { kioskLock, kioskUnlock, isKioskLocked } from 'src/native/KioskModule';
 */
import { NativeModules, Platform } from 'react-native';

const { KioskModule: _KioskModule } = NativeModules;

// ---------------------------------------------------------------------------
// Native interface
// ---------------------------------------------------------------------------
interface KioskNativeModule {
  lock(): Promise<void>;
  unlock(): Promise<void>;
  isLocked(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// No-op shim for non-Android environments
// ---------------------------------------------------------------------------
const KioskModuleShim: KioskNativeModule = {
  lock:     () => Promise.resolve(),
  unlock:   () => Promise.resolve(),
  isLocked: () => Promise.resolve(false),
};

const KioskModule: KioskNativeModule =
  Platform.OS === 'android' && _KioskModule != null
    ? (_KioskModule as KioskNativeModule)
    : KioskModuleShim;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Activate Android kiosk / LockTaskMode.
 *
 * Hides status bar, navigation bar, and system chrome (IMMERSIVE_STICKY).
 * Starts the foreground service to prevent OS eviction.
 * Uses LockTaskMode when the app holds Device Owner; falls back to
 * screen-pinning for sideloaded installs.
 */
export const kioskLock = (): Promise<void> => KioskModule.lock();

/**
 * Deactivate kiosk mode.
 *
 * Restores system UI, stops the foreground service, and exits
 * LockTaskMode / screen-pinning.
 *
 * IMPORTANT: call this only after Admin PIN verification succeeds or
 * a valid S3 recovery command is received. Those flows are implemented
 * in separate tickets — this is the stub they wire into.
 */
export const kioskUnlock = (): Promise<void> => KioskModule.unlock();

/**
 * Returns true when the device is currently locked into kiosk mode.
 *
 * Use this to guard admin-only navigation routes and to detect
 * unexpected exits from kiosk mode on foreground resume.
 */
export const isKioskLocked = (): Promise<boolean> => KioskModule.isLocked();

export default KioskModule;
