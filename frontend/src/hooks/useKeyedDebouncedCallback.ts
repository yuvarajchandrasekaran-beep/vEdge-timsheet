import { useCallback, useEffect, useRef } from "react";

/**
 * Same idea as useDebouncedCallback, but keyed — the Monthly/Fortnight grid
 * is one continuous table spanning several weeks, and each week still
 * autosaves to its own `PUT /timesheets/me/:weekStart` independently. A
 * single shared timer would let an edit in one week cancel a pending save
 * in another; keying by weekStart gives each week its own timer.
 */
export function useKeyedDebouncedCallback<Args extends unknown[], R = void>(
  fn: (key: string, ...args: Args) => R,
  delayMs: number
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Args>());

  useEffect(() => {
    return () => {
      for (const [key, timeout] of timers.current) {
        clearTimeout(timeout);
        const args = pending.current.get(key);
        if (args) fnRef.current(key, ...args);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debounced = useCallback(
    (key: string, ...args: Args) => {
      pending.current.set(key, args);
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        pending.current.delete(key);
        timers.current.delete(key);
        fnRef.current(key, ...args);
      }, delayMs);
      timers.current.set(key, t);
    },
    [delayMs]
  );

  /** Flushes every pending key immediately and returns each call's return value (e.g. a save promise). */
  const flushAll = useCallback((): R[] => {
    const results: R[] = [];
    for (const [key, timeout] of [...timers.current.entries()]) {
      clearTimeout(timeout);
      timers.current.delete(key);
      const args = pending.current.get(key);
      if (args) {
        pending.current.delete(key);
        results.push(fnRef.current(key, ...args));
      }
    }
    return results;
  }, []);

  return { debounced, flushAll };
}
