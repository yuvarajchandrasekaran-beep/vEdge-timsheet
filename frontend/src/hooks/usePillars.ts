import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { Pillar, SubPillar } from "../types";

export function usePillars(enabled = true) {
  return useQuery({
    queryKey: ["pillars"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Pillar[] }>("/pillars");
      return res.data.data;
    },
    enabled,
  });
}

// Every Pillar/Sub-Pillar change can rename what tasks display, so project
// data (which carries the names inline) is refetched alongside the list.
function useInvalidatePillars() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["pillars"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
}

export function useCreatePillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async (body: { name: string }) => {
      const res = await apiClient.post<Pillar>("/pillars", body);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiClient.put<Pillar>(`/pillars/${id}`, { name });
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/pillars/${id}`);
    },
    onSuccess: invalidate,
  });
}

export function useCreateSubPillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async ({ pillarId, name }: { pillarId: string; name: string }) => {
      const res = await apiClient.post<SubPillar>(`/pillars/${pillarId}/sub-pillars`, { name });
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSubPillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiClient.put<SubPillar>(`/pillars/sub-pillars/${id}`, { name });
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSubPillar() {
  const invalidate = useInvalidatePillars();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/pillars/sub-pillars/${id}`);
    },
    onSuccess: invalidate,
  });
}
