import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
