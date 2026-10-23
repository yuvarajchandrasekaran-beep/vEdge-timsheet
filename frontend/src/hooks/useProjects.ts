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

export function useClients(enabled = true) {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await apiClient.get<Client[] | ListResponse<Client>>("/clients");
      const data = res.data;
      return (Array.isArray(data) ? data : data.data) as Client[];
    },
    staleTime: 5 * 60 * 1000,
    // GET /clients is Super Admin / HR Admin / Project Admin only — an
    // Individual User gets a 403, so callers reachable by that role (the
    // Projects page's Clients tab/filter, Reports' client filter) must pass
    // `enabled: false` for them.
    enabled,
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

/** Status and/or holiday calendar assignment — the Clients tab's inline
 * controls (HR/Super Admin only; see /clients PUT's own role gate). */
export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: "ACTIVE" | "INACTIVE"; holidayCalendarId?: string | null }) => {
      const res = await apiClient.put<Client>(`/clients/${id}`, patch);
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
  /** Forces membership-only scoping even for Super Admin/HR Admin, who
   * otherwise get every project — used by the timesheet entry pages, where
   * logging time requires real membership regardless of role (see the
   * backend's GET /projects for the matching NOT_ASSIGNED enforcement). */
  mine?: boolean;
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
  sendTimesheetToClient?: boolean;
  clientContactEmail?: string | null;
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
      // apiClient defaults to "Content-Type: application/json" for every
      // request; omitting an explicit override here still leaves that
      // default in place, so the multipart boundary never gets set and
      // multer sees no file at all — surfaced to the user as a generic
      // "Couldn't validate this file" error. postForm() is axios's built-in
      // escape hatch: it drops the JSON default and lets the browser
      // generate the correct multipart Content-Type + boundary.
      const res = await apiClient.postForm<ImportBatch>("/projects/import/dry-run", form);
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
