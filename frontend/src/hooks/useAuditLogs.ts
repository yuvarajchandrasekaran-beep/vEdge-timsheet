import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { AuditLog, ListResponse } from "../types";

export interface AuditLogQueryParams {
  entityType?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditLogs(params: AuditLogQueryParams) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<AuditLog>>("/audit-logs", { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}
