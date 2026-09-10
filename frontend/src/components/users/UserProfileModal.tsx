import { useState } from "react";
import { Modal } from "../common/Modal";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { StatusBadge } from "../common/Badge";
import { Avatar } from "../common/Avatar";
import { useDepartments, useRoles } from "../../hooks/useDepartments";
import { useUpdateUser, useUser, useUserHistory } from "../../hooks/useUsers";
import { ROLE_LABELS, type RoleName, type UserStatus } from "../../types";
import { formatDateTime } from "../../utils/format";

export function UserProfileModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const userQuery = useUser(userId ?? undefined);
  const historyQuery = useUserHistory(userId ?? undefined);
  const updateUser = useUpdateUser();
  const { data: departments } = useDepartments();
  const { data: roles } = useRoles();
  const [tab, setTab] = useState<"profile" | "history">("profile");

  const user = userQuery.data;

  return (
    <Modal open={!!userId} onClose={onClose} title={user ? user.name : "User profile"} size="lg">
      {userQuery.isLoading ? (
        <LoadingBlock />
      ) : userQuery.isError ? (
        <ErrorState error={userQuery.error} onRetry={() => userQuery.refetch()} />
      ) : user ? (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name} size="lg" />
            <div>
              <p className="text-base font-semibold text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">
                {user.employeeId} · {user.email}
              </p>
            </div>
            <div className="ml-auto">
              <StatusBadge status={user.status} kind="user" />
            </div>
          </div>

          <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1 sm:w-fit">
            {(["profile", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  tab === t ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "profile" ? "Profile" : "Change history"}
              </button>
            ))}
          </div>

          {tab === "profile" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Role</span>
                <select
                  defaultValue={user.role}
                  className="input"
                  onChange={(e) => updateUser.mutate({ id: user.id, patch: { role: e.target.value as RoleName } })}
                >
                  {(roles?.map((r) => r.name) ?? ["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r as RoleName] ?? r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Department</span>
                <select
                  defaultValue={user.department}
                  className="input"
                  onChange={(e) => updateUser.mutate({ id: user.id, patch: { department: e.target.value } })}
                >
                  {departments?.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Job title</span>
                <input
                  defaultValue={user.jobTitle}
                  className="input"
                  onBlur={(e) => updateUser.mutate({ id: user.id, patch: { jobTitle: e.target.value } })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Status</span>
                <select
                  defaultValue={user.status}
                  className="input"
                  onChange={(e) => updateUser.mutate({ id: user.id, patch: { status: e.target.value as UserStatus } })}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <div className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-gray-700">Manager</span>
                <p className="text-gray-600">{user.managerName ?? "—"}</p>
              </div>
            </div>
          ) : historyQuery.isLoading ? (
            <LoadingBlock />
          ) : historyQuery.isError || !historyQuery.data?.length ? (
            <p className="py-8 text-center text-sm text-gray-400">No change history recorded for this user yet.</p>
          ) : (
            <div className="space-y-2">
              {historyQuery.data.map((h) => (
                <div key={h.id} className="rounded-xl border border-gray-100 px-4 py-2.5 text-sm">
                  <p className="text-gray-800">
                    <span className="font-medium">{h.field}</span> changed from{" "}
                    <span className="text-gray-500">"{h.oldValue}"</span> to{" "}
                    <span className="font-medium text-gray-900">"{h.newValue}"</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {h.changedBy} · {formatDateTime(h.changedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
