import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { ApprovalLevel, ApprovalQueueItem, ListResponse } from "../types";

export interface ApprovalsQueryParams {
  level?: ApprovalLevel;
  project?: string;
  department?: string;
  pendingDays?: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  page?: number;
  pageSize?: number;
}

export function useApprovalsPending(params: ApprovalsQueryParams, enabled = true) {
  return useQuery({
    queryKey: ["approvals", "pending", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<ApprovalQueueItem>>("/approvals/pending", { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
    enabled,
    // Someone else's submission can land in this queue at any time — the
    // global 30s staleTime (main.tsx) plus refetchOnWindowFocus:false means a
    // page left open wouldn't otherwise pick up a new pending item until the
    // user navigated away and back. Always-fresh + a short poll keeps an
    // open Approvals screen (and the sidebar/dashboard badge counts that use
    // this same hook) honest without the user needing to reload.
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

export function useApproveTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ timesheetId, comment }: { timesheetId: string; comment?: string }) => {
      const res = await apiClient.post(`/approvals/${timesheetId}/approve`, { comment });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

export function useRejectTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ timesheetId, comment }: { timesheetId: string; comment: string }) => {
      const res = await apiClient.post(`/approvals/${timesheetId}/reject`, { comment });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (timesheetIds: string[]) => {
      const res = await apiClient.post("/approvals/bulk-approve", { timesheetIds });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

export function useDelegateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      timesheetId,
      toUserId,
      from,
      to,
    }: {
      timesheetId: string;
      toUserId: string;
      from: string;
      to: string;
    }) => {
      const res = await apiClient.post(`/approvals/${timesheetId}/delegate`, { toUserId, from, to });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}
