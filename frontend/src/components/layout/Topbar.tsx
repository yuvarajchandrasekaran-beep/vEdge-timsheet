import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useMarkAllNotificationsRead, useNotifications } from "../../hooks/useNotifications";
import { usePageHeaderValue } from "../../hooks/usePageHeader";
import { ROLE_LABELS } from "../../types";
import { formatDateTime } from "../../utils/format";
import { Avatar } from "../common/Avatar";
import { IconBell, IconChevronDown, IconMail, IconMenu } from "../common/icons";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: notifications } = useNotifications(true);
  const markAllRead = useMarkAllNotificationsRead();
  const { title, subtitle } = usePageHeaderValue();

  const unreadCount = notifications?.length ?? 0;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <button
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
        aria-label="Open navigation"
      >
        <IconMenu size={20} />
      </button>

      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg">{title}</h1>
        {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 sm:block"
          aria-label="Mail"
          onClick={() => navigate("/notifications")}
        >
          <IconMail size={19} />
        </button>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Notifications"
          >
            <IconBell size={19} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-100 bg-white shadow-card">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">Notifications</p>
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!notifications || notifications.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">You're all caught up.</p>
                  ) : (
                    notifications.slice(0, 6).map((n) => (
                      <div key={n.id} className="border-b border-gray-50 px-4 py-3 last:border-0 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.message}</p>
                        <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(n.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
                <button
                  onClick={() => {
                    setNotifOpen(false);
                    navigate("/notifications");
                  }}
                  className="block w-full rounded-b-xl px-4 py-3 text-center text-sm font-medium text-brand-primary hover:bg-gray-50"
                >
                  View all
                </button>
              </div>
            </>
          )}
        </div>

        <div className="relative ml-1">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-gray-100"
          >
            <Avatar name={user?.name ?? "?"} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-gray-900">{user?.name}</span>
              <span className="block text-xs leading-tight text-gray-500">
                {user ? ROLE_LABELS[user.role] : ""}
              </span>
            </span>
            <IconChevronDown size={14} className="hidden text-gray-400 sm:block" />
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-card">
                <div className="border-b border-gray-50 px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
