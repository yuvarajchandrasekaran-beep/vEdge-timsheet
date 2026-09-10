import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type { ClientAuditReport, ReportFilters, ReportKey, ReportResponse } from "../types";

export function useReport(reportKey: ReportKey, filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ["reports", reportKey, filters],
    queryFn: async () => {
      const res = await apiClient.get<ReportResponse>(`/reports/${reportKey}`, { params: filters });
      return res.data;
    },
    enabled,
  });
}

export function useClientAuditReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ["reports", "client-audit", filters],
    queryFn: async () => {
      const res = await apiClient.get<ClientAuditReport>("/reports/client-audit", { params: filters });
      return res.data;
    },
    enabled: enabled && !!filters.clientId,
  });
}

const EXTENSION: Record<string, string> = { pdf: "pdf", xlsx: "xlsx", csv: "csv" };

export function useExportReport() {
  return useMutation({
    mutationFn: async ({
      reportKey,
      format,
      filters,
    }: {
      reportKey: ReportKey;
      format: "pdf" | "xlsx" | "csv";
      filters: ReportFilters;
    }) => {
      const res = await apiClient.get(`/reports/${reportKey}/export`, {
        params: { ...filters, format },
        responseType: "blob",
      });
      downloadBlob(res.data, `${reportKey}.${EXTENSION[format]}`);
    },
  });
}

export function useScheduleReport() {
  return useMutation({
    mutationFn: async ({
      reportKey,
      cadence,
      recipients,
    }: {
      reportKey: ReportKey;
      cadence: "DAILY" | "WEEKLY" | "MONTHLY";
      recipients: string[];
    }) => {
      const res = await apiClient.post(`/reports/${reportKey}/schedule`, { cadence, recipients });
      return res.data;
    },
  });
}
