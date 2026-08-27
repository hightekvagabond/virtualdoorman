/**
 * useInactivityTimer
 *
 * Tracks touch events at the root navigator level and fires `onIdle` after
 * `timeoutSeconds` of no interaction. Calls `onWake` when the first touch
 * arrives while idle.
 *
 * Rules:
 *  - Paused entirely while `paused` is true (camera capture in progress).
 *  - Hot-configurable: changing `timeoutSeconds` restarts the running timer
 *    from that moment; no app restart required.
 *  - Uses `useRef` for the timer handle so restarts never cause re-renders.
 */
import { useEffect, useRef, useCallback } from 'react';

export interface UseInactivityTimerOptions {
  /** Seconds without a touch event before `onIdle` fires. */
  timeoutSeconds: number;
  /** Called when the timer expires. */
  onIdle: () => void;
  /**
   * Called when the first touch arrives while in the idle state (i.e. the
   * screensaver is showing). Use this to hide the screensaver and return to
   * the start of the capture flow.
   */
  onWake: () => void;
  /**
   * When true the timer does not run — prevents the screensaver from
   * triggering mid-capture.
   */
  paused?: boolean;
}

export interface UseInactivityTimerResult {
  /**
   * Call this on every touch event at the root PanResponder / TouchableWithoutFeedback.
   * Also call it from the screensaver touch handler; the hook will detect the
   * idle-→-active transition and invoke `onWake`.
   */
  onTouch: () => void;
  /**
   * Whether the inactivity timer has currently fired and not yet been reset.
   * Useful for rendering the screensaver conditionally.
   */
  isIdle: boolean;
}

export function useInactivityTimer({
  timeoutSeconds,
  onIdle,
  onWake,
  paused = false,
}: UseInactivityTimerOptions): UseInactivityTimerResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);
  // Re-render gate: we expose `isIdle` as a boolean but keep the source of
  // truth in a ref so timer callbacks never capture stale closure values.
  const setIdleRef = useRef<((v: boolean) => void) | null>(null);

  // We need a state setter to trigger re-renders when idle status changes.
  // Import useState lazily to keep this hook a pure logic file.
  const { useState } = require('react') as typeof import('react');
  const [isIdle, setIsIdle] = useState(false);
  setIdleRef.current = setIsIdle;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      setIdleRef.current?.(true);
      onIdle();
    }, timeoutSeconds * 1000);
  }, [clearTimer, onIdle, timeoutSeconds]);

  // Start/stop based on `paused`.
  useEffect(() => {
    if (paused) {
      clearTimer();
    } else {
      startTimer();
    }
    return clearTimer;
  }, [paused, startTimer, clearTimer]);

  // Re-arm when `timeoutSeconds` changes (hot-config from S3).
  useEffect(() => {
    if (!paused) {
      startTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutSeconds]);

  const onTouch = useCallback(() => {
    if (paused) return;
    if (isIdleRef.current) {
      // Wake from screensaver.
      isIdleRef.current = false;
      setIdleRef.current?.(false);
      onWake();
    }
    startTimer();
  }, [paused, onWake, startTimer]);

  return { onTouch, isIdle };
}
