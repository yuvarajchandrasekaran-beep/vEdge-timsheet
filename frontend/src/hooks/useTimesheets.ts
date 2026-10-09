import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type { ListResponse, Timesheet, TimesheetSearchRow, TimesheetStatus } from "../types";

export function useMyTimesheet(weekStart: string) {
  return useQuery({
    queryKey: ["timesheets", "me", weekStart],
    queryFn: async () => {
      const res = await apiClient.get<Timesheet>("/timesheets/me", { params: { weekStart } });
      return res.data;
    },
    enabled: !!weekStart,
  });
}

/**
 * Fetches several weeks at once (Monthly/Fortnight) — same query key per
 * week as useMyTimesheet, so the unified period grid and any per-week
 * autosave share one cache entry per week instead of double-fetching.
 */
export function useMyTimesheetsForPeriod(weekStarts: string[]) {
  return useQueries({
    queries: weekStarts.map((weekStart) => ({
      queryKey: ["timesheets", "me", weekStart],
      queryFn: async () => {
        const res = await apiClient.get<Timesheet>("/timesheets/me", { params: { weekStart } });
        return res.data;
      },
      enabled: !!weekStart,
    })),
  });
}

export interface TimesheetEntryInput {
  projectTaskId: string;
  entryDate: string;
  hours: number;
  notes?: string;
}

export interface SaveDraftInput {
  weekStart: string;
  entries: TimesheetEntryInput[];
  weekNotes?: string;
}

/** PUT /timesheets/me/:weekStart — upserts entries; used for debounced autosave. */
export function useSaveTimesheetDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekStart, entries, weekNotes }: SaveDraftInput) => {
      const res = await apiClient.put<Timesheet>(`/timesheets/me/${weekStart}`, { entries, weekNotes });
      return res.data;
    },
    onSuccess: (data, variables) => {
      qc.setQueryData(["timesheets", "me", variables.weekStart], data);
    },
  });
}

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, weekStart }: { id: string; weekStart: string }) => {
      const res = await apiClient.post<Timesheet>(`/timesheets/${id}/submit`);
      return { data: res.data, weekStart };
    },
    onSuccess: ({ data, weekStart }) => {
      qc.setQueryData(["timesheets", "me", weekStart], data);
      qc.invalidateQueries({ queryKey: ["timesheets", "me", "history"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function useRecallTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, weekStart }: { id: string; weekStart: string }) => {
      const res = await apiClient.post<Timesheet>(`/timesheets/${id}/recall`);
      return { data: res.data, weekStart };
    },
    onSuccess: ({ data, weekStart }) => {
      qc.setQueryData(["timesheets", "me", weekStart], data);
      // Was missing relative to useSubmitTimesheet's onSuccess — anything
      // reading useTimesheetHistory (e.g. the Dashboard's status tiles)
      // stayed stale after a Recall until an unrelated refetch happened to
      // fire, matching the reported "status not updated until refresh" bug.
      qc.invalidateQueries({ queryKey: ["timesheets", "me", "history"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

export function useTimesheetHistory(weeks = 12) {
  return useQuery({
    queryKey: ["timesheets", "me", "history", weeks],
    queryFn: async () => {
      const res = await apiClient.get<Timesheet[]>("/timesheets/me/history", { params: { weeks } });
      return res.data;
    },
  });
}

export function useTimesheetDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["timesheets", "detail", id],
    queryFn: async () => {
      const res = await apiClient.get<Timesheet>(`/timesheets/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export interface TimesheetSearchParams {
  userIds?: string[];
  status?: TimesheetStatus | "";
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

/** Backs Approvals > All Timesheets — look up any in-scope user's (or
 * users') timesheets regardless of status, current or past (see
 * GET /timesheets in routes/timesheets.ts for the server-side scoping). */
export function useTimesheetSearch(params: TimesheetSearchParams, enabled = true) {
  return useQuery({
    queryKey: ["timesheets", "search", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<TimesheetSearchRow>>("/timesheets", {
        params: { ...params, userIds: params.userIds?.length ? params.userIds.join(",") : undefined },
      });
      return res.data;
    },
    enabled,
  });
}

/**
 * Copies hours + project/task rows from the immediately preceding period of
 * the same length (comments always come back blank) — one call handles the
 * Weekly view's "Copy Last Week" (a single week), and the Fortnight/Monthly
 * views' "Copy previous period" (their full set of weeks at once).
 */
export function useCopyPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekStarts }: { weekStarts: string[] }) => {
      const res = await apiClient.post<Timesheet[]>("/timesheets/copy", { weekStarts });
      return res.data;
    },
    onSuccess: (data) => {
      for (const t of data) {
        qc.setQueryData(["timesheets", "me", t.weekStart], t);
      }
    },
  });
}

/** Downloads the current Monthly/Fortnight grid (one row per project/task,
 * one column per date) as an Excel or CSV file — mirrors exactly what's on
 * screen, including every week in the period. */
export function useExportPeriod() {
  return useMutation({
    mutationFn: async ({ weekStarts, format }: { weekStarts: string[]; format: "xlsx" | "csv" }) => {
      const res = await apiClient.get("/timesheets/me/period-export", {
        params: { weekStarts: weekStarts.join(","), format },
        responseType: "blob",
      });
      downloadBlob(res.data, `timesheet_${weekStarts[0]}_to_${weekStarts[weekStarts.length - 1]}.${format}`);
    },
  });
}

export function useSubmitBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekStarts }: { weekStarts: string[] }) => {
      const res = await apiClient.post<{ submitted: string[] }>("/timesheets/submit-batch", { weekStarts });
      return { ...res.data, weekStarts };
    },
    onSuccess: ({ weekStarts }) => {
      for (const ws of weekStarts) {
        qc.invalidateQueries({ queryKey: ["timesheets", "me", ws] });
      }
      qc.invalidateQueries({ queryKey: ["timesheets", "me", "history"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}
