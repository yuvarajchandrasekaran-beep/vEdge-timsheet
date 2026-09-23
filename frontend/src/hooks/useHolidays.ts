import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { Holiday } from "../types";

export function useHolidays(year: number) {
  return useQuery({
    queryKey: ["holidays", year],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Holiday[] }>("/holidays", { params: { year } });
      return res.data.data;
    },
  });
}

/**
 * Date -> holiday name lookup for the calendar grids (Weekly/Period/Day),
 * so a date column can be highlighted and given a tooltip without every
 * caller re-deriving which year(s) its visible dates fall in. Takes the
 * exact list of visible date strings rather than a year range so a Monthly
 * view spanning a Dec/Jan boundary fetches both years, not just one.
 */
export function useHolidayMap(dates: string[]) {
  const years = useMemo(() => Array.from(new Set(dates.map((d) => Number(d.slice(0, 4))))).sort(), [dates.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: ["holidays", year],
      queryFn: async () => {
        const res = await apiClient.get<{ data: Holiday[] }>("/holidays", { params: { year } });
        return res.data.data;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const result of results) {
      for (const holiday of result.data ?? []) {
        map.set(holiday.date, holiday.name);
      }
    }
    return map;
  }, [results]);
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; date: string }) => {
      const res = await apiClient.post<Holiday>("/holidays", body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; date?: string }) => {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}

export function useSyncFederalHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (year: number) => {
      const res = await apiClient.post<{ year: number; created: Holiday[]; createdCount: number }>("/holidays/sync-federal", { year });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}
