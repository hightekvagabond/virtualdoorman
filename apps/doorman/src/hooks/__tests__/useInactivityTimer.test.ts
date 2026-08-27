/**
 * useInactivityTimer tests
 *
 * Uses Jest fake timers so we don't wait real seconds.
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useInactivityTimer } from '../useInactivityTimer';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useInactivityTimer', () => {
  it('fires onIdle after timeoutSeconds with no touch', () => {
    const onIdle = jest.fn();
    const onWake = jest.fn();

    renderHook(() =>
      useInactivityTimer({ timeoutSeconds: 10, onIdle, onWake }),
    );

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onWake).not.toHaveBeenCalled();
  });

  it('does not fire onIdle if touch resets the timer', () => {
    const onIdle = jest.fn();
    const onWake = jest.fn();

    const { result } = renderHook(() =>
      useInactivityTimer({ timeoutSeconds: 10, onIdle, onWake }),
    );

    act(() => {
      jest.advanceTimersByTime(8_000);
      result.current.onTouch();
      jest.advanceTimersByTime(8_000);
    });

    // 16s elapsed but timer was reset at 8s, so only 8s since last touch.
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('calls onWake when touched while idle', () => {
    const onIdle = jest.fn();
    const onWake = jest.fn();

    const { result } = renderHook(() =>
      useInactivityTimer({ timeoutSeconds: 5, onIdle, onWake }),
    );

    act(() => {
      jest.advanceTimersByTime(5_000); // go idle
    });
    expect(onIdle).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onTouch(); // wake
    });
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('does not fire onIdle when paused', () => {
    const onIdle = jest.fn();
    const onWake = jest.fn();

    renderHook(() =>
      useInactivityTimer({ timeoutSeconds: 5, onIdle, onWake, paused: true }),
    );

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('isIdle starts false and becomes true after timeout', () => {
    const onIdle = jest.fn();
    const onWake = jest.fn();

    const { result } = renderHook(() =>
      useInactivityTimer({ timeoutSeconds: 5, onIdle, onWake }),
    );

    expect(result.current.isIdle).toBe(false);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(result.current.isIdle).toBe(true);
  });
});
