import { useMemo } from "react";
import { getWeekStart } from "../utils/week";

/** Monday-based ISO date string for "this week", stable across re-renders in a session. */
export function useCurrentWeekStart(): string {
  return useMemo(() => getWeekStart(new Date()), []);
}
