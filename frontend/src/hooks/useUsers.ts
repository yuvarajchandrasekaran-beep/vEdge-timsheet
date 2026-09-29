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

export function useUsers(params: UsersQueryParams, enabled = true) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<User>>("/users", { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
    // GET /users is Super Admin / HR Admin / Project Admin only — an
    // Individual User gets a 403, so callers reachable by that role (e.g.
    // the read-only project member list anyone can open) must pass
    // `enabled: false` for them.
    enabled,
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
      // apiClient defaults to "Content-Type: application/json" for every
      // request; a plain .post() with a FormData body still carries that
      // default, so the multipart boundary never gets set and multer sees
      // no file at all (400 "No file uploaded", shown to the user as a
      // generic "couldn't validate this file"). postForm() is axios's
      // built-in escape hatch — it drops the JSON default and lets the
      // browser generate the correct multipart Content-Type + boundary.
      const res = await apiClient.postForm<ImportBatch>("/users/import/dry-run", form);
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
