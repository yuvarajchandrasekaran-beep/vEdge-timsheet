import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type { ClientTimesheetSend, ClientTimesheetSendPreview } from "../types";

export function useClientSendPreview(projectId: string | undefined, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ["client-send", "preview", projectId, periodStart, periodEnd],
    queryFn: async () => {
      const res = await apiClient.get<ClientTimesheetSendPreview>(`/projects/${projectId}/client-send/preview`, {
        params: { periodStart, periodEnd },
      });
      return res.data;
    },
    enabled: !!projectId && !!periodStart && !!periodEnd,
  });
}

export function useSendClientTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      recipientEmail,
      periodStart,
      periodEnd,
      entryIds,
    }: {
      projectId: string;
      recipientEmail: string;
      periodStart: string;
      periodEnd: string;
      entryIds: string[];
    }) => {
      const res = await apiClient.post<ClientTimesheetSend>(`/projects/${projectId}/client-send`, {
        recipientEmail,
        periodStart,
        periodEnd,
        entryIds,
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-sends"] }),
  });
}

export function useClientSendHistory(projectId?: string) {
  return useQuery({
    queryKey: ["client-sends", projectId ?? "all"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ClientTimesheetSend[] }>("/client-sends", {
        params: projectId ? { projectId } : undefined,
      });
      return res.data.data;
    },
  });
}

export async function downloadClientSendFile(id: string, fileName: string) {
  const res = await apiClient.get(`/client-sends/${id}/download`, { responseType: "blob" });
  downloadBlob(res.data, fileName);
}
