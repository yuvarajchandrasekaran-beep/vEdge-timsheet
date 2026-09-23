import { useEffect, useState } from "react";

const STORAGE_KEY = "timesync:showWeekends";

/**
 * "Compact view" preference shared across Weekly/Fortnight/Monthly — off by
 * default (weekends hidden, since most projects only track a Mon–Fri week),
 * remembered per-browser so it doesn't reset every time you switch views.
 */
export function useShowWeekends() {
  const [showWeekends, setShowWeekends] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(showWeekends));
    } catch {
      // Private browsing / storage disabled — the toggle still works for this session.
    }
  }, [showWeekends]);

  return [showWeekends, setShowWeekends] as const;
}
