import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type { ClientAuditReport, DailyTimesheetReport, ReportFilters, ReportKey, ReportResponse, WeeklySummaryReport } from "../types";

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

export function useWeeklySummaryReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ["reports", "weekly-summary", filters],
    queryFn: async () => {
      const res = await apiClient.get<WeeklySummaryReport>("/reports/weekly-summary", { params: filters });
      return res.data;
    },
    enabled,
  });
}

export function useDailyTimesheetReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ["reports", "daily-timesheet", filters],
    queryFn: async () => {
      const res = await apiClient.get<DailyTimesheetReport>("/reports/daily-timesheet", { params: filters });
      return res.data;
    },
    enabled,
  });
}

const EXTENSION: Record<string, string> = { pdf: "pdf", xlsx: "xlsx", csv: "csv" };

export function useExportReport() {
  return useMutation({
    mutationFn: async ({
      reportKey,
      format,
      filters,
      columns,
    }: {
      reportKey: ReportKey;
      format: "pdf" | "xlsx" | "csv";
      filters: ReportFilters;
      // Visible columns, in display order — see the Reports screen's
      // "Columns" control. Omitted (or every column still visible, in its
      // default order) exports everything, same as before this existed.
      columns?: string[];
    }) => {
      const res = await apiClient.get(`/reports/${reportKey}/export`, {
        params: { ...filters, format, columns: columns?.length ? columns.join(",") : undefined },
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
