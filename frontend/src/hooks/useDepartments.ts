import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { Department, Role } from "../types";

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await apiClient.get<Department[]>("/departments");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await apiClient.get<Role[]>("/roles");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
