import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { Timesheet } from "../types";

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

export function useCopyLastWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekStart }: { weekStart: string }) => {
      const res = await apiClient.post<Timesheet>("/timesheets/copy-last-week", { weekStart });
      return res.data;
    },
    onSuccess: (data, variables) => {
      qc.setQueryData(["timesheets", "me", variables.weekStart], data);
    },
  });
}
