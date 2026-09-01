/**
 * useKioskMode
 *
 * React hook that activates Android kiosk mode when the component mounts
 * (in tablet / kiosk app mode) and cleans up on unmount.
 *
 * Features:
 *   • Calls kioskLock() on mount when `enabled` is true.
 *   • Calls kioskUnlock() on unmount (cleanup).
 *   • Re-locks if the app returns to the foreground while locked state is
 *     lost (handles edge cases on non-Device-Owner installs).
 *   • Exposes requestUnlock() for the Admin PIN flow.
 *
 * Usage:
 *   const { locked, requestUnlock } = useKioskMode({
 *     enabled: isKioskApp,
 *     onUnlockRequest: () => navigation.navigate('AdminPanel'),
 *   });
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { kioskLock, kioskUnlock, isKioskLocked } from '../native/KioskModule';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseKioskModeOptions {
  /**
   * Pass `true` only in kiosk / tablet app mode. When `false` the hook
   * is completely inert — no lock is acquired. Defaults to `true`.
   */
  enabled?: boolean;

  /**
   * Called after `requestUnlock()` successfully exits kiosk mode.
   * Intended to navigate the operator to the admin panel.
   */
  onUnlockRequest?: () => void;
}

export interface UseKioskModeResult {
  /** True while the device is locked in kiosk mode. */
  locked: boolean;

  /**
   * Trigger this ONLY after Admin PIN is verified (or a recovery command
   * is received). Calls kioskUnlock() then fires onUnlockRequest.
   * Throws on native error so callers can surface an alert.
   */
  requestUnlock: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKioskMode({
  enabled = true,
  onUnlockRequest,
}: UseKioskModeOptions = {}): UseKioskModeResult {
  const [locked, setLocked] = useState(false);
  const mountedRef = useRef(true);
  const didLockRef = useRef(false);

  // Lock on mount, unlock on unmount
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    const doLock = async () => {
      try {
        await kioskLock();
        if (mountedRef.current) {
          setLocked(true);
          didLockRef.current = true;
        }
      } catch (err) {
        console.warn('[useKioskMode] lock() failed:', err);
      }
    };

    doLock();

    return () => {
      mountedRef.current = false;
      if (didLockRef.current) {
        didLockRef.current = false;
        kioskUnlock().catch((err) =>
          console.warn('[useKioskMode] unlock() on unmount failed:', err),
        );
      }
    };
  }, [enabled]);

  // Re-lock on foreground resume (non-Device-Owner edge case)
  useEffect(() => {
    if (!enabled) return;

    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      try {
        const stillLocked = await isKioskLocked();
        if (!stillLocked && mountedRef.current) {
          console.warn('[useKioskMode] kiosk lock lost — re-locking');
          await kioskLock();
          if (mountedRef.current) {
            setLocked(true);
            didLockRef.current = true;
          }
        }
      } catch (err) {
        console.warn('[useKioskMode] re-lock on foreground failed:', err);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [enabled]);

  // Unlock (call only after PIN / recovery command verification)
  const requestUnlock = useCallback(async () => {
    try {
      await kioskUnlock();
      if (mountedRef.current) {
        setLocked(false);
        didLockRef.current = false;
      }
      onUnlockRequest?.();
    } catch (err) {
      console.warn('[useKioskMode] requestUnlock() failed:', err);
      throw err;
    }
  }, [onUnlockRequest]);

  return { locked, requestUnlock };
}

export default useKioskMode;
