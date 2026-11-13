import { useEffect, useState } from "react";

const STORAGE_KEY = "timesync:timesheetColumns";

/**
 * Which optional columns (see ColumnsPicker) are switched on — none by
 * default, since the Monthly grid already uses most of the screen width.
 * Remembered per-browser, like the Compact view preference.
 */
export function useVisibleColumns() {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleKeys));
    } catch {
      // Private browsing / storage disabled — the picker still works for this session.
    }
  }, [visibleKeys]);

  return [visibleKeys, setVisibleKeys] as const;
}
