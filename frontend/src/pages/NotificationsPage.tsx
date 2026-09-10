import { useState } from "react";
import clsx from "clsx";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from "../hooks/useNotifications";
import { usePageHeader } from "../hooks/usePageHeader";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { IconBell } from "../components/common/icons";
import { formatDateTime } from "../utils/format";
import type { NotificationPreferences } from "../types";

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const notificationsQuery = useNotifications(filter === "unread");
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const prefsQuery = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  usePageHeader("Notification Center", `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => markAllRead.mutate()} className="btn-secondary">
          Mark all read
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex gap-1 rounded-xl bg-gray-100 p-1 sm:w-fit">
            {(["all", "unread"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "flex-1 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors sm:flex-none",
                  filter === f ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
            {notificationsQuery.isLoading ? (
              <LoadingBlock />
            ) : notificationsQuery.isError ? (
              <div className="p-4">
                <ErrorState error={notificationsQuery.error} onRetry={() => notificationsQuery.refetch()} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<IconBell size={32} />} title="You're all caught up" description="New notifications will show up here." />
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={clsx("flex items-start gap-3 px-5 py-4", !n.read && "bg-blue-50/40")}
                  >
                    <span
                      className={clsx(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-brand-primary"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-primary hover:bg-blue-50"
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Preferences</h2>
          <p className="mb-4 text-xs text-gray-500">Choose how you'd like to be notified.</p>
          {prefsQuery.isLoading ? (
            <LoadingBlock />
          ) : prefsQuery.isError || !prefsQuery.data ? (
            <p className="text-sm text-gray-400">Preferences unavailable right now.</p>
          ) : (
            <PreferencesForm value={prefsQuery.data} onChange={(next) => updatePrefs.mutate(next)} />
          )}
        </div>
      </div>
    </div>
  );
}

function PreferencesForm({
  value,
  onChange,
}: {
  value: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
}) {
  return (
    <div className="space-y-4">
      <Toggle label="Email notifications" checked={value.email} onChange={(email) => onChange({ ...value, email })} />
      <Toggle label="In-app notifications" checked={value.inApp} onChange={(inApp) => onChange({ ...value, inApp })} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">Digest frequency</span>
        <select
          value={value.digest}
          onChange={(e) => onChange({ ...value, digest: e.target.value as NotificationPreferences["digest"] })}
          className="input"
        >
          <option value="NONE">None</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
        </select>
      </label>
      <div className="border-t border-gray-100 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Reminders</p>
        <Toggle
          label="Submission deadline"
          checked={value.reminders.submitDeadline}
          onChange={(v) => onChange({ ...value, reminders: { ...value.reminders, submitDeadline: v } })}
        />
        <Toggle
          label="Approval pending"
          checked={value.reminders.approvalPending}
          onChange={(v) => onChange({ ...value, reminders: { ...value.reminders, approvalPending: v } })}
        />
        <Toggle
          label="Rejection notice"
          checked={value.reminders.rejection}
          onChange={(v) => onChange({ ...value, reminders: { ...value.reminders, rejection: v } })}
        />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-sm text-gray-700">
      {label}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand-primary" : "bg-gray-200")}
      >
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </label>
  );
}
