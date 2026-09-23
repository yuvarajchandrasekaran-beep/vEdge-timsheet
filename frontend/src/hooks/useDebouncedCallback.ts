import { useCallback, useEffect, useRef } from "react";

/** Returns a debounced version of `fn` that also flushes any pending call on unmount. */
export function useDebouncedCallback<Args extends unknown[], R = void>(fn: (...args: Args) => R, delayMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        if (pendingArgsRef.current) fnRef.current(...pendingArgsRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debounced = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        pendingArgsRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );

  // Returns the flushed call's return value (e.g. a promise), or undefined
  // if nothing was pending — lets a caller `await flush()` to know a
  // just-flushed async save has actually landed before doing something that
  // depends on it (e.g. submitting right after an edit).
  const flush = useCallback((): R | undefined => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingArgsRef.current) {
      const args = pendingArgsRef.current;
      pendingArgsRef.current = null;
      return fnRef.current(...args);
    }
    return undefined;
  }, []);

  return { debounced, flush };
}
