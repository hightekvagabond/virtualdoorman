/**
 * useScreenBrightness
 *
 * Applies the `screen_brightness` value from remote config via the
 * `react-native-screen-brightness` native module.
 *
 * Hot-applies: whenever `brightness` changes (e.g. after an S3 config sync)
 * the new value is pushed to the OS without an app restart.
 *
 * Falls back gracefully in environments where the native module is absent
 * (e.g. development on a simulator that returns null).
 */
import { useEffect } from 'react';

// react-native-screen-brightness is a native module; we import it lazily so
// that it does not crash in test environments where native bridges are absent.
let ScreenBrightness: { setBrightness: (v: number) => Promise<void> } | null =
  null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ScreenBrightness = require('react-native-screen-brightness');
} catch {
  // Native module not available (simulator / test). No-op.
}

/**
 * Apply `brightness` (0.0–1.0) to the device screen.
 * Clamps to [0, 1] before sending to the native module.
 */
export function useScreenBrightness(brightness: number): void {
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, brightness));
    ScreenBrightness?.setBrightness(clamped).catch((err: unknown) => {
      // Non-fatal — log but do not surface to the user.
      if (__DEV__) {
        console.warn('[useScreenBrightness] Failed to set brightness:', err);
      }
    });
  }, [brightness]);
}
