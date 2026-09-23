import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Modal } from "../common/Modal";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { StatusBadge, Badge } from "../common/Badge";
import { Avatar } from "../common/Avatar";
import { UserMultiSelectTypeahead } from "../common/UserMultiSelectTypeahead";
import { IconPlus, IconTrash } from "../common/icons";
import {
  useAddProjectMember,
  useCreateProjectTask,
  useDeleteProjectTask,
  useProject,
  useRemoveProjectMember,
  useUpdateProject,
  useUpdateProjectTask,
} from "../../hooks/useProjects";
import { useUsers } from "../../hooks/useUsers";
import { getApiErrorMessage } from "../../api/client";
import { formatDate, formatHoursDecimal } from "../../utils/format";
import { BILLING_TYPE_LABELS, type BillingType, type ProjectStatus } from "../../types";

type DetailTab = "overview" | "tasks" | "members";

export function ProjectDetailModal({
  projectId,
  initialTab = "overview",
  onClose,
}: {
  projectId: string | null;
  initialTab?: DetailTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab, projectId]);

  const projectQuery = useProject(projectId ?? undefined);
  const updateProject = useUpdateProject();
  const createTask = useCreateProjectTask();
  const updateTask = useUpdateProjectTask();
  const deleteTask = useDeleteProjectTask();
  const addMember = useAddProjectMember();
  const removeMember = useRemoveProjectMember();

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskHours, setNewTaskHours] = useState("");
  const [newTaskBillable, setNewTaskBillable] = useState(true);
  const [newMemberId, setNewMemberId] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const project = projectQuery.data;

  const admins = project?.members.filter((m) => m.roleOnProject === "Project Admin") ?? [];
  // Every project membership row is also a team member — an admin is never
  // excluded from this list. A person who administers the project can (and
  // usually does) also need to log time against it, so the Members section
  // shows them too, with their role noted underneath their name; removal
  // still routes through removeMemberSafely, which keeps the "at least one
  // admin" rule regardless of which section's Remove button was clicked.
  const regularMembers = project?.members ?? [];

  // Only the project's own Project Admin(s), or a Super Admin, can add
  // people to the project or its tasks — mirrors the backend's
  // assertProjectScope + requireRole checks (see routes/projects.ts).
  // Everyone else can still view this modal, just without the controls that
  // would otherwise 403.
  const { user, hasRole } = useAuth();
  const canManage = hasRole("SUPER_ADMIN") || (hasRole("PROJECT_ADMIN") && admins.some((a) => a.userId === user?.id));
  // GET /users 403s for anyone who isn't Super Admin/HR Admin/Project Admin —
  // only fetch the directory when the add-member controls (gated on
  // canManage) can actually be shown.
  const usersQuery = useUsers({ page: 1, pageSize: 200 }, !!projectId && canManage);

  function removeTask(taskId: string, taskName: string) {
    if (!project) return;
    if (!confirm(`Delete task "${taskName}"? This cannot be undone.`)) return;
    setTaskError(null);
    deleteTask.mutate(
      { id: taskId, projectId: project.id },
      { onError: (err) => setTaskError(getApiErrorMessage(err)) }
    );
  }

  function removeMemberSafely(userId: string, roleOnProject: string) {
    if (!project) return;
    if (roleOnProject === "Project Admin" && admins.length <= 1) {
      setMemberError("A project must have at least one admin — add another admin before removing this one.");
      return;
    }
    setMemberError(null);
    removeMember.mutate({ projectId: project.id, userId }, { onError: () => setMemberError("Couldn't remove this person.") });
  }

  return (
    <Modal open={!!projectId} onClose={onClose} title={project ? `${project.name} (${project.code})` : "Project"} size="xl">
      {projectQuery.isLoading ? (
        <LoadingBlock />
      ) : projectQuery.isError ? (
        <ErrorState error={projectQuery.error} onRetry={() => projectQuery.refetch()} />
      ) : project ? (
        <div>
          <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
            {(["overview", "tasks", "members"] as DetailTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  tab === t ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Info label="Client" value={project.clientName} />
                <Info label="Status" value={<StatusBadge status={project.status} kind="project" />} />
                <Info label="Billing type" value={BILLING_TYPE_LABELS[project.billingType]} />
                <Info label="Start date" value={formatDate(project.startDate)} />
                <Info label="End date" value={project.endDate ? formatDate(project.endDate) : "—"} />
                <Info label="Project admins" value={admins.length ? admins.map((m) => m.userName).join(", ") : "—"} />
                <Info label="Budget hours (from tasks)" value={formatHoursDecimal(project.budgetHours)} />
                <Info label="Logged hours" value={formatHoursDecimal(project.loggedHours ?? 0)} />
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Status</span>
                  <select
                    defaultValue={project.status}
                    className="input"
                    onChange={(e) =>
                      updateProject.mutate({ id: project.id, patch: { status: e.target.value as ProjectStatus } })
                    }
                  >
                    {["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Billing type</span>
                  <select
                    defaultValue={project.billingType}
                    className="input"
                    onChange={(e) =>
                      updateProject.mutate({ id: project.id, patch: { billingType: e.target.value as BillingType } })
                    }
                  >
                    {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Client billing</h3>
                <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={project.sendTimesheetToClient ?? false}
                    onChange={(e) => updateProject.mutate({ id: project.id, patch: { sendTimesheetToClient: e.target.checked } })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Send timesheets to the client for this project
                </label>
                {project.sendTimesheetToClient && (
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Client contact email</span>
                      <input
                        type="email"
                        defaultValue={project.clientContactEmail ?? ""}
                        placeholder="billing@client.com"
                        className="input"
                        onBlur={(e) =>
                          updateProject.mutate({ id: project.id, patch: { clientContactEmail: e.target.value.trim() || null } })
                        }
                      />
                    </label>
                    <Link
                      to={`/projects/${project.id}/client-send`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Send timesheet to client…
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "tasks" && (
            <div className="space-y-3">
              {project.tasks.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No tasks yet.</p>}
              {project.tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{t.name}</span>
                      <Badge tone={t.billable ? "brand" : "neutral"}>{t.billable ? "Billable" : "Non-billable"}</Badge>
                    </div>
                    {t.estimatedHours != null && (
                      <p className="mt-0.5 text-xs text-gray-400">{formatHoursDecimal(t.estimatedHours)} estimated</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <select
                      defaultValue={t.status}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                      onChange={(e) => updateTask.mutate({ id: t.id, patch: { status: e.target.value as "ACTIVE" | "INACTIVE" } })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                    <button
                      onClick={() => removeTask(t.id, t.name)}
                      className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-status-danger"
                      aria-label="Delete task"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {taskError && <p className="text-xs text-status-danger">{taskError}</p>}
              <div className="flex items-center gap-2 pt-2">
                <input
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="New task name…"
                  className="input flex-1"
                />
                <input
                  type="number"
                  min={0}
                  value={newTaskHours}
                  onChange={(e) => setNewTaskHours(e.target.value)}
                  placeholder="Hours"
                  className="input w-24"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={newTaskBillable}
                    onChange={(e) => setNewTaskBillable(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Billable
                </label>
                <button
                  onClick={() => {
                    if (!newTaskName.trim()) return;
                    createTask.mutate(
                      {
                        projectId: project.id,
                        name: newTaskName.trim(),
                        billable: newTaskBillable,
                        estimatedHours: newTaskHours === "" ? undefined : Number(newTaskHours),
                      },
                      {
                        onSuccess: () => {
                          setNewTaskName("");
                          setNewTaskHours("");
                          setNewTaskBillable(true);
                        },
                      }
                    );
                  }}
                  className="btn-primary shrink-0 px-3"
                >
                  <IconPlus size={16} />
                </button>
              </div>
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Project admins</h3>
                <div className="space-y-2">
                  {admins.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.userName ?? m.userId} size="sm" />
                        <p className="text-sm font-medium text-gray-800">{m.userName ?? m.userId}</p>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => removeMemberSafely(m.userId, m.roleOnProject)}
                          disabled={admins.length <= 1}
                          title={admins.length <= 1 ? "A project must have at least one admin" : "Remove admin"}
                          className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          aria-label="Remove admin"
                        >
                          <IconTrash size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canManage && (
                  <div className="mt-2">
                    <UserMultiSelectTypeahead
                      users={(usersQuery.data?.data ?? [])
                        .filter((u) => !admins.some((a) => a.userId === u.id))
                        .map((u) => ({ id: u.id, name: u.name, department: u.department }))}
                      selectedIds={[]}
                      onChange={(ids) => {
                        const userId = ids[0];
                        if (!userId) return;
                        addMember.mutate({ projectId: project.id, userId, roleOnProject: "Project Admin" });
                      }}
                      placeholder="Search people to add as an admin…"
                    />
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Members</h3>
                {regularMembers.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No members added yet.</p>}
                <div className="space-y-2">
                  {regularMembers.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.userName ?? m.userId} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{m.userName ?? m.userId}</p>
                          <p className="text-xs text-gray-500">{m.roleOnProject}</p>
                        </div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => removeMemberSafely(m.userId, m.roleOnProject)}
                          className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-status-danger"
                          aria-label="Remove member"
                        >
                          <IconTrash size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canManage && (
                  <div className="flex gap-2 pt-2">
                    <select value={newMemberId} onChange={(e) => setNewMemberId(e.target.value)} className="input">
                      <option value="">Select a user to add…</option>
                      {usersQuery.data?.data
                        .filter((u) => !project.members.some((m) => m.userId === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!newMemberId) return;
                        addMember.mutate(
                          { projectId: project.id, userId: newMemberId, roleOnProject: "Member" },
                          { onSuccess: () => setNewMemberId("") }
                        );
                      }}
                      className="btn-primary shrink-0 px-3"
                    >
                      <IconPlus size={16} />
                    </button>
                  </div>
                )}
                {canManage && usersQuery.isError && <p className="mt-1 text-xs text-status-danger">Couldn't load the user directory.</p>}
              </div>

              {memberError && <p className="text-xs text-status-danger">{memberError}</p>}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-800">{value}</p>
    </div>
  );
}
