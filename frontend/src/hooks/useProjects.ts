import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, downloadBlob } from "../api/client";
import type {
  BillingType,
  Client,
  ImportBatch,
  ListResponse,
  Project,
  ProjectMember,
  ProjectStatus,
  ProjectTask,
} from "../types";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await apiClient.get<Client[] | ListResponse<Client>>("/clients");
      const data = res.data;
      const list = Array.isArray(data) ? data : data.data;
      return list.map((raw: any) => ({
        id: raw.id,
        name: raw.name,
        status: raw.status,
        projectCount: raw._count?.projects ?? 0,
      })) as Client[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; status?: "ACTIVE" | "INACTIVE" }) => {
      const res = await apiClient.post<Client>("/clients", input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export interface ProjectsQueryParams {
  clientId?: string;
  status?: ProjectStatus | "";
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useProjects(params: ProjectsQueryParams = {}) {
  return useQuery({
    queryKey: ["projects", params],
    queryFn: async () => {
      const res = await apiClient.get<ListResponse<Project>>("/projects", { params });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: async () => {
      const res = await apiClient.get<Project>(`/projects/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export interface CreateProjectTaskInput {
  name: string;
  billable: boolean;
  estimatedHours?: number;
}

export interface CreateProjectInput {
  clientId: string;
  code: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string | null;
  billingType: BillingType;
  adminIds: string[];
  memberIds?: string[];
  tasks?: CreateProjectTaskInput[];
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await apiClient.post<Project>("/projects", input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  startDate?: string;
  endDate?: string | null;
  billingType?: BillingType;
  status?: ProjectStatus;
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateProjectPatch }) => {
      const res = await apiClient.patch<Project>(`/projects/${id}`, patch);
      return res.data;
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", "detail", variables.id] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/projects/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useCreateProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: { projectId: string } & CreateProjectTaskInput) => {
      const res = await apiClient.post<ProjectTask>(`/projects/${projectId}/tasks`, body);
      return res.data;
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", "detail", variables.projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<ProjectTask, "name" | "status" | "billable" | "estimatedHours">> }) => {
      const res = await apiClient.patch<ProjectTask>(`/project-tasks/${id}`, patch);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProjectTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      await apiClient.delete(`/project-tasks/${id}`);
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", "detail", variables.projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useAddProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      ...body
    }: { projectId: string } & Pick<ProjectMember, "userId" | "roleOnProject" | "maxHoursPerDay" | "maxHoursPerWeek">) => {
      const res = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, body);
      return res.data;
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", "detail", variables.projectId] });
    },
  });
}

export function useRemoveProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      await apiClient.delete(`/projects/${projectId}/members/${userId}`);
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", "detail", variables.projectId] });
    },
  });
}

export function useProjectImportDryRun() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await apiClient.post<ImportBatch>("/projects/import/dry-run", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
  });
}

export function useProjectImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batchId, rows }: { batchId: string; rows: Record<string, unknown>[] }) => {
      const res = await apiClient.post("/projects/import/commit", { batchId, rows });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export async function downloadProjectImportTemplate() {
  const res = await apiClient.get("/projects/import/template", { responseType: "blob" });
  downloadBlob(res.data, "timesync-projects-template.xlsx");
}
