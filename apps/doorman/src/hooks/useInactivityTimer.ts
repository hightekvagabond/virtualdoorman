/**
 * useInactivityTimer
 *
 * Fires `onTimeout` after `timeoutMs` milliseconds of no touch activity.
 * The timer resets on every touch anywhere in the app — wire this at the
 * root navigator level so it intercepts all gestures.
 *
 * Hot-apply: pass the current `timeoutMs` from config; React's effect
 * dependency picks up changes and restarts the timer immediately.
 *
 * The timer is paused while `paused` is true (e.g. during active camera
 * capture) so we never screensave mid-flow.
 */
import { useEffect, useRef, useCallback } from 'react';

interface Options {
  /** Milliseconds of inactivity before {@link onTimeout} fires. */
  timeoutMs: number;
  /** Called when the inactivity deadline is reached. */
  onTimeout: () => void;
  /**
   * While true the timer is suspended. Set to true during active camera
   * capture to prevent screensaver interrupting the flow.
   * @default false
   */
  paused?: boolean;
}

export interface InactivityTimerApi {
  /** Call this on every root-level touch event to reset the timer. */
  resetTimer: () => void;
}

export function useInactivityTimer({
  timeoutMs,
  onTimeout,
  paused = false,
}: Options): InactivityTimerApi {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  // Keep the callback ref current without re-triggering the effect.
  onTimeoutRef.current = onTimeout;

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (paused) return;
    clear();
    timerRef.current = setTimeout(() => {
      onTimeoutRef.current();
    }, timeoutMs);
  }, [paused, clear, timeoutMs]);

  // Start / restart whenever timeoutMs or paused changes.
  useEffect(() => {
    if (paused) {
      clear();
      return clear;
    }
    resetTimer();
    return clear;
  }, [paused, timeoutMs, resetTimer, clear]);

  return { resetTimer };
}
