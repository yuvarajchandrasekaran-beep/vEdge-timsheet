import { useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePageHeader } from "../hooks/usePageHeader";
import { useClients, useDeleteProject, useProjects } from "../hooks/useProjects";
import type { ProjectStatus } from "../types";
import { getApiErrorMessage } from "../api/client";
import { StatusBadge } from "../components/common/Badge";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Pagination } from "../components/common/Pagination";
import { NewProjectModal } from "../components/projects/NewProjectModal";
import { NewClientModal } from "../components/projects/NewClientModal";
import { ProjectDetailModal } from "../components/projects/ProjectDetailModal";
import { formatDate, formatHoursDecimal } from "../utils/format";
import { ProgressBar } from "../components/common/ProgressBar";
import { IconEdit, IconEye, IconPlus, IconSearch, IconTrash, IconUsers } from "../components/common/icons";

type Tab = "projects" | "clients";
const PAGE_SIZE = 8;
const TAB_LABELS: Record<Tab, string> = { projects: "Projects", clients: "Clients" };

export default function ProjectsPage() {
  const { user, hasRole } = useAuth();
  usePageHeader(
    "Projects & Tasks",
    user?.role === "INDIVIDUAL_USER" ? "Projects you're assigned to" : "Manage clients, projects and sub-tasks"
  );
  const canCreate = hasRole("SUPER_ADMIN", "PROJECT_ADMIN");
  const canDelete = hasRole("SUPER_ADMIN");

  const [tab, setTab] = useState<Tab>("projects");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [clientFilter, setClientFilter] = useState("");
  const [page, setPage] = useState(1);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [detail, setDetail] = useState<{ id: string; tab: "overview" | "tasks" | "members" } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: clients } = useClients();
  const projectsQuery = useProjects({ status: statusFilter, clientId: clientFilter, search, page, pageSize: PAGE_SIZE });
  const deleteProject = useDeleteProject();

  const projects = projectsQuery.data?.data ?? [];
  const total = projectsQuery.data?.meta.total ?? 0;

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex justify-end">
        {canCreate && (
          <button onClick={() => setNewModalOpen(true)} className="btn-primary">
            <IconPlus size={16} />
            New Project
          </button>
        )}
      </div>

      {deleteError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-status-danger">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-3 shrink-0 font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 sm:w-fit">
        {(["projects", "clients"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              tab === t ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search projects by name or code…"
              className="input pl-9"
            />
          </div>
          {tab === "projects" && (
            <>
              <select
                value={clientFilter}
                onChange={(e) => {
                  setClientFilter(e.target.value);
                  setPage(1);
                }}
                className="input sm:w-48"
              >
                <option value="">All clients</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as ProjectStatus | "");
                  setPage(1);
                }}
                className="input sm:w-40"
              >
                <option value="">All statuses</option>
                {["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {projectsQuery.isLoading ? (
          <LoadingBlock />
        ) : projectsQuery.isError ? (
          <div className="p-4">
            <ErrorState error={projectsQuery.error} onRetry={() => projectsQuery.refetch()} />
          </div>
        ) : tab === "projects" ? (
          projects.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No projects found" description="Try adjusting your filters, or create a new project." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Utilization</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const pct = p.budgetHours ? ((p.loggedHours ?? 0) / p.budgetHours) * 100 : 0;
                      return (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.code}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{p.clientName}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={p.status} kind="project" />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "Ongoing"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <ProgressBar pct={pct} className="w-24" />
                              <span className="text-xs text-gray-500">
                                {formatHoursDecimal(p.loggedHours ?? 0)}/{formatHoursDecimal(p.budgetHours)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <RowAction icon={<IconEye size={15} />} label="View" onClick={() => setDetail({ id: p.id, tab: "overview" })} />
                              <RowAction icon={<IconEdit size={15} />} label="Edit" onClick={() => setDetail({ id: p.id, tab: "overview" })} />
                              <RowAction icon={<IconUsers size={15} />} label="Members" onClick={() => setDetail({ id: p.id, tab: "members" })} />
                              {canDelete && (
                                <RowAction
                                  icon={<IconTrash size={15} />}
                                  label="Delete"
                                  danger
                                  onClick={() => {
                                    if (confirm(`Delete project "${p.name}"? This cannot be undone.`)) {
                                      setDeleteError(null);
                                      deleteProject.mutate(p.id, { onError: (err) => setDeleteError(getApiErrorMessage(err)) });
                                    }
                                  }}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )
        ) : (
          <>
            {canCreate && (
              <div className="flex justify-end border-b border-gray-100 p-4">
                <button onClick={() => setNewClientModalOpen(true)} className="btn-primary">
                  <IconPlus size={16} />
                  New Client
                </button>
              </div>
            )}
            {!clients || clients.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No clients found" description="Create your first client to start adding projects." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status ?? "ACTIVE"} kind="user" />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{c.projectCount ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <NewProjectModal open={newModalOpen} onClose={() => setNewModalOpen(false)} />
      <NewClientModal open={newClientModalOpen} onClose={() => setNewClientModalOpen(false)} />
      <ProjectDetailModal projectId={detail?.id ?? null} initialTab={detail?.tab} onClose={() => setDetail(null)} />
    </div>
  );
}

function RowAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 ${
        danger ? "text-status-danger hover:bg-rose-50" : "text-gray-500"
      }`}
    >
      {icon}
    </button>
  );
}
