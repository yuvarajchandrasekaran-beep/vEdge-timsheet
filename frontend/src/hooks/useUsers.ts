import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type { ImportBatch, ListResponse, RoleName, User, UserChangeHistoryEntry, UserStatus } from "../types";

export interface UsersQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: RoleName | "";
  department?: string;
  status?: UserStatus | "";
}

export function useUsers(params: UsersQueryParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<User>>("/users", { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ["users", "detail", id],
    queryFn: async () => {
      const res = await apiClient.get<User>(`/users/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useUserHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["users", "history", id],
    queryFn: async () => {
      const res = await apiClient.get<UserChangeHistoryEntry[]>(`/users/${id}/history`);
      return res.data;
    },
    enabled: !!id,
    retry: false,
  });
}

export interface CreateUserInput {
  employeeId: string;
  name: string;
  email: string;
  role: RoleName;
  department: string;
  jobTitle: string;
  managerId?: string | null;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await apiClient.post<User>("/users", input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CreateUserInput> & { status?: UserStatus } }) => {
      const res = await apiClient.patch<User>(`/users/${id}`, patch);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["users", "detail", variables.id] });
    },
  });
}

export function useUserImportDryRun() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await apiClient.post<ImportBatch>("/users/import/dry-run", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
  });
}

export function useUserImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batchId, rows }: { batchId: string; rows: Record<string, unknown>[] }) => {
      const res = await apiClient.post("/users/import/commit", { batchId, rows });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export async function downloadUserImportTemplate() {
  const res = await apiClient.get("/users/import/template", { responseType: "blob" });
  downloadBlob(res.data, "timesync-users-template.xlsx");
}
