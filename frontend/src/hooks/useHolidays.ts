import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { Holiday, HolidayCalendar } from "../types";

/** One calendar's holidays for a year — the admin management view (see
 * HolidaysPage), scoped to whichever calendar is being edited. */
export function useHolidays(calendarId: string | undefined, year: number) {
  return useQuery({
    queryKey: ["holidays", calendarId, year],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Holiday[] }>("/holidays", { params: { calendarId, year } });
      return res.data.data;
    },
    enabled: !!calendarId,
  });
}

/**
 * Date -> every holiday landing on it (from every calendar the current user
 * is entitled to via their own project/client associations — see GET
 * /holidays/mine), for the calendar grids (Weekly/Period/Day) to highlight a
 * date and color-code it per calendar, including more than one color when
 * calendars overlap on the same day. Takes the exact list of visible date
 * strings rather than a year range so a Monthly view spanning a Dec/Jan
 * boundary fetches both years, not just one.
 */
export function useHolidayMap(dates: string[]) {
  const years = useMemo(() => Array.from(new Set(dates.map((d) => Number(d.slice(0, 4))))).sort(), [dates.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: ["holidays", "mine", year],
      queryFn: async () => {
        const res = await apiClient.get<{ data: Holiday[] }>("/holidays/mine", { params: { year } });
        return res.data.data;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const result of results) {
      for (const holiday of result.data ?? []) {
        const list = map.get(holiday.date) ?? [];
        list.push(holiday);
        map.set(holiday.date, list);
      }
    }
    return map;
  }, [results]);
}

// GET /holiday-calendars is HR/Super Admin only — pass `enabled: false` for
// any other caller (e.g. a Project Admin, who can still see a client's
// calendar name/color from the client record itself, just not browse or
// reassign calendars).
export function useHolidayCalendars(enabled = true) {
  return useQuery({
    queryKey: ["holiday-calendars"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: HolidayCalendar[] }>("/holiday-calendars");
      return res.data.data;
    },
    enabled,
  });
}

export function useCreateHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; color: string }) => {
      const res = await apiClient.post<HolidayCalendar>("/holiday-calendars", body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holiday-calendars"] }),
  });
}

export function useUpdateHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; color?: string }) => {
      const res = await apiClient.put<HolidayCalendar>(`/holiday-calendars/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holiday-calendars"] }),
  });
}

export function useDeleteHolidayCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/holiday-calendars/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holiday-calendars"] }),
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; date: string; calendarId: string }) => {
      const res = await apiClient.post<Holiday>("/holidays", body);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["holiday-calendars"] });
    },
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; date?: string; calendarId?: string }) => {
      const res = await apiClient.put<Holiday>(`/holidays/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/holidays/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["holiday-calendars"] });
    },
  });
}

export function useSyncFederalHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, calendarId }: { year: number; calendarId: string }) => {
      const res = await apiClient.post<{ year: number; created: Holiday[]; createdCount: number }>("/holidays/sync-federal", {
        year,
        calendarId,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["holiday-calendars"] });
    },
  });
}
