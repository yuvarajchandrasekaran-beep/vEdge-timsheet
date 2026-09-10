import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDepartments, useRoles } from "../hooks/useDepartments";
import { usePageHeader } from "../hooks/usePageHeader";
import { useUpdateUser, useUsers } from "../hooks/useUsers";
import type { RoleName, UserStatus } from "../types";
import { ROLE_LABELS } from "../types";
import { Avatar } from "../components/common/Avatar";
import { StatusBadge } from "../components/common/Badge";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Pagination } from "../components/common/Pagination";
import { NewUserModal } from "../components/users/NewUserModal";
import { UserProfileModal } from "../components/users/UserProfileModal";
import { IconEdit, IconPlus, IconSearch, IconUpload, IconUsers } from "../components/common/icons";

type Tab = "users" | "roles";
const PAGE_SIZE = 8;

export default function UsersPage() {
  usePageHeader("User Management", "Manage accounts, roles and departments");
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleName | "">("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const { data: departments } = useDepartments();
  const { data: roles } = useRoles();
  const usersQuery = useUsers({ page, pageSize: PAGE_SIZE, search, role: roleFilter, department: departmentFilter });
  const allUsersForCounts = useUsers({ page: 1, pageSize: 500 });
  const updateUser = useUpdateUser();

  const users = usersQuery.data?.data ?? [];
  const total = usersQuery.data?.meta.total ?? 0;

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of allUsersForCounts.data?.data ?? []) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    return counts;
  }, [allUsersForCounts.data]);

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex justify-end">
        <div className="flex gap-2">
          <button onClick={() => navigate("/bulk-upload?type=users")} className="btn-secondary">
            <IconUpload size={16} />
            Bulk Import
          </button>
          <button onClick={() => setNewModalOpen(true)} className="btn-primary">
            <IconPlus size={16} />
            New User
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 sm:w-fit">
        {(["users", "roles"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors sm:flex-none ${
              tab === t ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "users" ? "All Users" : "Roles"}
          </button>
        ))}
      </div>

      {tab === "users" ? (
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
                placeholder="Search by name, employee ID or email…"
                className="input pl-9"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as RoleName | "");
                setPage(1);
              }}
              className="input sm:w-48"
            >
              <option value="">All roles</option>
              {(roles?.map((r) => r.name) ?? []).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              className="input sm:w-44"
            >
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {usersQuery.isLoading ? (
            <LoadingBlock />
          ) : usersQuery.isError ? (
            <div className="p-4">
              <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
            </div>
          ) : users.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No users found" description="Try a different search or filter." />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} size="sm" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{u.name}</p>
                              <p className="text-xs text-gray-500">{u.employeeId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{ROLE_LABELS[u.role]}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.department}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.status} kind="user" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setProfileId(u.id)}
                              title="Edit"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                            >
                              <IconEdit size={15} />
                            </button>
                            <button
                              onClick={() =>
                                updateUser.mutate({ id: u.id, patch: { status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } })
                              }
                              title={u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                                u.status === "ACTIVE"
                                  ? "text-status-danger hover:bg-rose-50"
                                  : "text-status-success hover:bg-emerald-50"
                              }`}
                            >
                              {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(roles ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-primary">
                  <IconUsers size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ROLE_LABELS[r.name]}</p>
                  <p className="text-xs text-gray-500">{roleCounts.get(r.name) ?? 0} users</p>
                </div>
              </div>
              {r.description && <p className="mt-3 text-sm text-gray-600">{r.description}</p>}
            </div>
          ))}
          {!roles?.length && !allUsersForCounts.isLoading && (
            <EmptyState title="No roles configured" description="Roles are managed server-side." />
          )}
        </div>
      )}

      <NewUserModal open={newModalOpen} onClose={() => setNewModalOpen(false)} />
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
