import { useState } from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { useDepartments, useRoles } from "../../hooks/useDepartments";
import { useCreateUser, useUsers, type CreateUserInput } from "../../hooks/useUsers";
import { ROLE_LABELS, type RoleName } from "../../types";

export function NewUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: departments } = useDepartments();
  const { data: roles } = useRoles();
  const managersQuery = useUsers({ page: 1, pageSize: 200 });
  const createUser = useCreateUser();

  const [form, setForm] = useState<Partial<CreateUserInput>>({ role: "INDIVIDUAL_USER" });
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setForm({ role: "INDIVIDUAL_USER" });
    setError(null);
    onClose();
  }

  function handleSubmit() {
    if (!form.employeeId || !form.name || !form.email || !form.role || !form.department || !form.jobTitle) {
      setError("Please fill in all required fields.");
      return;
    }
    setError(null);
    createUser.mutate(
      {
        employeeId: form.employeeId,
        name: form.name,
        email: form.email,
        role: form.role,
        department: form.department,
        jobTitle: form.jobTitle,
        managerId: form.managerId || null,
      },
      { onSuccess: handleClose }
    );
  }

  const roleOptions: RoleName[] = (roles?.map((r) => r.name) as RoleName[] | undefined) ?? [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "PROJECT_ADMIN",
    "INDIVIDUAL_USER",
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New User"
      size="lg"
      footer={
        <>
          <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={createUser.isPending} className="btn-primary px-4 py-2">
            {createUser.isPending && <Spinner size={14} className="text-white" />}
            Create User
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Employee ID *</label>
          <input
            value={form.employeeId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
            placeholder="VE-1010"
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Full name *</label>
          <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Email *</label>
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="name@vivid-edge.com"
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Role *</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as RoleName }))}
            className="input"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Department *</label>
          <select
            value={form.department ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            className="input"
          >
            <option value="">Select department…</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Job title *</label>
          <input
            value={form.jobTitle ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Manager</label>
          <select
            value={form.managerId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
            className="input"
          >
            <option value="">No manager</option>
            {managersQuery.data?.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-status-danger">{error}</p>}
      {createUser.isError && <p className="mt-2 text-sm text-status-danger">Couldn't create the user. Please try again.</p>}
      <p className="mt-4 text-xs text-gray-400">
        New users are created with the organization's standard password —{" "}
        <span className="font-mono font-medium text-gray-600">Password123!</span> — and can log in with it
        immediately. There's no email delivery in this environment, so share it with them directly.
      </p>
    </Modal>
  );
}
