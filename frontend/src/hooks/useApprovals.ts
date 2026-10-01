import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { ApprovalQueueItem, ListResponse } from "../types";

export interface ApprovalsQueryParams {
  search?: string;
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

export function useBulkReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ timesheetIds, comment }: { timesheetIds: string[]; comment: string }) => {
      const res = await apiClient.post("/approvals/bulk-reject", { timesheetIds, comment });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

export interface Delegation {
  id: string;
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  toUserName?: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

/** The current user's own nominated proxies (as the delegator) — see
 * backend/src/routes/delegations.ts. A delegate automatically sees
 * delegated timesheets in their own Approvals inbox while active; there's
 * no separate "acting as" view to fetch. */
export function useDelegations(enabled = true) {
  return useQuery({
    queryKey: ["delegations"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Delegation[] }>("/delegations");
      return res.data.data;
    },
    enabled,
  });
}

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { toUserId: string; startDate: string; endDate: string }) => {
      const res = await apiClient.post<Delegation>("/delegations", body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });
}

export function useRevokeDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/delegations/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });
}
