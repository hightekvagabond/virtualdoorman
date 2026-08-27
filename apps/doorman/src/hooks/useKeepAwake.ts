/**
 * useKeepAwake
 *
 * Applies and clears Android's FLAG_KEEP_SCREEN_ON via a thin NativeModule
 * so the kiosk tablet screen never sleeps while the app is running.
 *
 * The module is resolved at runtime so the hook is safe to call on any
 * platform — on iOS or in Jest it simply no-ops rather than throwing.
 *
 * Usage: call once at the root component level.
 */
import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';

/** Shape of the native KeepAwake module (Android only). */
interface KeepAwakeModule {
  activate: () => void;
  deactivate: () => void;
}

function getModule(): KeepAwakeModule | null {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules['VDKeepAwake'] as KeepAwakeModule | undefined;
  return mod ?? null;
}

export function useKeepAwake(): void {
  useEffect(() => {
    const mod = getModule();
    if (!mod) return;
    mod.activate();
    return () => {
      mod.deactivate();
    };
  }, []);
}
