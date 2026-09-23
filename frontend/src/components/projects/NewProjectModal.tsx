import { useState, type ReactNode } from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { UserMultiSelectTypeahead } from "../common/UserMultiSelectTypeahead";
import { IconPlus, IconTrash } from "../common/icons";
import { useClients, useCreateProject, type CreateProjectInput, type CreateProjectTaskInput } from "../../hooks/useProjects";
import { useUsers } from "../../hooks/useUsers";
import { getApiErrorMessage } from "../../api/client";
import { useToast } from "../common/Toast";
import { BILLING_TYPE_LABELS, type BillingType } from "../../types";

const BILLING_OPTIONS: { value: BillingType; label: string }[] = (
  Object.entries(BILLING_TYPE_LABELS) as [BillingType, string][]
).map(([value, label]) => ({ value, label }));

const EMPTY_TASK: CreateProjectTaskInput = { name: "", billable: true, estimatedHours: undefined };

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // This modal is always mounted (just hidden) by its parent, so its
  // queries would otherwise fire on every visit to the Projects page —
  // including for roles that can never open it (GET /clients and /users
  // both 403 for an Individual User) and before the modal is even open.
  // Only fetch once it's actually about to be shown.
  const { data: clients } = useClients(open);
  const allUsersQuery = useUsers({ page: 1, pageSize: 200 }, open);
  const createProject = useCreateProject();
  const { showToast } = useToast();

  const [form, setForm] = useState<Partial<CreateProjectInput>>({ billingType: "T_AND_M" });
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<CreateProjectTaskInput[]>([{ ...EMPTY_TASK }]);
  const [error, setError] = useState<string | null>(null);

  const totalTaskHours = tasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);

  function reset() {
    setForm({ billingType: "T_AND_M" });
    setAdminIds([]);
    setMemberIds(new Set());
    setTasks([{ ...EMPTY_TASK }]);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!form.clientId || !form.code || !form.name || !form.startDate) {
      setError("Please fill in all required fields.");
      return;
    }
    if (adminIds.length === 0) {
      setError("Select at least one project admin.");
      return;
    }
    if (form.endDate && form.endDate <= form.startDate) {
      setError("End date must be after start date.");
      return;
    }
    const cleanTasks = tasks.filter((t) => t.name.trim().length > 0);

    createProject.mutate(
      {
        clientId: form.clientId,
        code: form.code,
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate || null,
        billingType: form.billingType ?? "T_AND_M",
        adminIds,
        memberIds: Array.from(memberIds),
        tasks: cleanTasks,
      },
      {
        onSuccess: () => {
          showToast(`Project "${form.name}" created.`, "success");
          handleClose();
        },
      }
    );
  }

  function updateTask(idx: number, patch: Partial<CreateProjectTaskInput>) {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Project"
      size="lg"
      footer={
        <>
          {/* Rendered in the modal's fixed footer, not the scrollable body —
              a long form (many tasks) could otherwise scroll a validation or
              API error out of view, making the modal look "stuck" when it
              was really just failing silently off-screen. */}
          {(error || createProject.isError) && (
            <p className="mr-auto max-w-xs text-sm text-status-danger">
              {error ?? getApiErrorMessage(createProject.error, "Couldn't create the project. Please try again.")}
            </p>
          )}
          <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createProject.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {createProject.isPending && <Spinner size={14} className="text-white" />}
            Create Project
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client" required>
          <select
            value={form.clientId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            className="input"
          >
            <option value="">Select client…</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project code" required>
          <input
            value={form.code ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="e.g. ERP-01"
            className="input"
          />
        </Field>
        <Field label="Project name" required className="sm:col-span-2">
          <input
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Vivid Edge ERP"
            className="input"
          />
        </Field>
        <Field label="Start date" required>
          <input
            type="date"
            value={form.startDate ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={form.endDate ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="Billing type" required className="sm:col-span-2">
          <select
            value={form.billingType}
            onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value as BillingType }))}
            className="input"
          >
            {BILLING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project admins" required className="sm:col-span-2">
          <UserMultiSelectTypeahead
            users={(allUsersQuery.data?.data ?? []).map((u) => ({ id: u.id, name: u.name, department: u.department }))}
            selectedIds={adminIds}
            onChange={setAdminIds}
            placeholder="Search people to add as project admin…"
          />
          {allUsersQuery.isError && <p className="mt-1 text-xs text-status-danger">Couldn't load the user directory.</p>}
        </Field>
        <Field label="Initial team members" className="sm:col-span-2">
          <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 p-2">
            {allUsersQuery.data?.data.filter((u) => !adminIds.includes(u.id)).length ? (
              allUsersQuery.data.data
                .filter((u) => !adminIds.includes(u.id))
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={memberIds.has(u.id)}
                      onChange={() =>
                        setMemberIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {u.name} <span className="text-xs text-gray-400">({u.department})</span>
                  </label>
                ))
            ) : (
              <p className="px-2 py-3 text-sm text-gray-400">No users available to add yet.</p>
            )}
          </div>
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-baseline justify-between">
            <label className="block text-sm font-medium text-gray-700">Tasks</label>
            <span className="text-xs text-gray-400">
              Budget hours roll up from tasks — total: <span className="font-medium text-gray-600">{totalTaskHours}h</span>
            </span>
          </div>
          <div className="space-y-2">
            {tasks.map((task, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  value={task.name}
                  onChange={(e) => updateTask(idx, { name: e.target.value })}
                  placeholder="Task name, e.g. Requirements"
                  className="input flex-1"
                />
                <input
                  type="number"
                  min={0}
                  value={task.estimatedHours ?? ""}
                  onChange={(e) => updateTask(idx, { estimatedHours: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="Hours"
                  className="input w-24"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={task.billable}
                    onChange={(e) => updateTask(idx, { billable: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Billable
                </label>
                <button
                  type="button"
                  onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}
                  className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-status-danger"
                  aria-label="Remove task"
                >
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setTasks((prev) => [...prev, { ...EMPTY_TASK }])}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-primary hover:bg-blue-50"
            >
              <IconPlus size={14} /> Add task
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-status-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
