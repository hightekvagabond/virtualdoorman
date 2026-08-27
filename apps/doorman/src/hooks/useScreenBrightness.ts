/**
 * useScreenBrightness
 *
 * Applies the given brightness (0.0–1.0) via a thin NativeModule on Android.
 * Re-runs whenever `brightness` changes so config-sync hot-applies without
 * an app restart.
 *
 * Safe to call on any platform — no-ops outside Android and in Jest.
 */
import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';

interface ScreenBrightnessModule {
  setBrightness: (value: number) => void;
}

function getModule(): ScreenBrightnessModule | null {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules['VDScreenBrightness'] as ScreenBrightnessModule | undefined;
  return mod ?? null;
}

export function useScreenBrightness(brightness: number): void {
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, brightness));
    const mod = getModule();
    mod?.setBrightness(clamped);
  }, [brightness]);
}
