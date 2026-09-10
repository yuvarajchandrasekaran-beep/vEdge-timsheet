import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../hooks/useAuth";
import type { RoleName } from "../../types";
import {
  IconBarChart,
  IconCheckSquare,
  IconClock,
  IconDashboard,
  IconFolder,
  IconSettings,
  IconUsers,
} from "../common/icons";

interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
  roles?: RoleName[];
  badge?: number;
}

export function Sidebar({
  approvalsBadge,
  mobileOpen,
  onCloseMobile,
}: {
  approvalsBadge: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user } = useAuth();
  if (!user) return null;

  const items: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: IconDashboard },
    { to: "/timesheets", label: "Timesheets", icon: IconClock },
    {
      to: "/approvals/l1",
      label: "Approvals",
      icon: IconCheckSquare,
      roles: ["PROJECT_ADMIN", "HR_ADMIN", "SUPER_ADMIN"],
      badge: approvalsBadge,
    },
    {
      to: "/reports",
      label: "Reports",
      icon: IconBarChart,
      roles: ["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN"],
    },
    { to: "/projects", label: "Projects", icon: IconFolder },
    {
      to: "/users",
      label: "Users",
      icon: IconUsers,
      roles: ["SUPER_ADMIN", "HR_ADMIN"],
    },
  ];

  const visible = items.filter((item) => !item.roles || item.roles.includes(user.role));

  const content = (
    <div className="flex h-full flex-col bg-sidebar-bg text-slate-300">
      <div className="px-4 py-6">
        <div className="rounded-xl bg-white px-4 py-4">
          <img src="/brand/logo.svg" alt="Vivid Edge Integration COE" className="h-auto w-full" />
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              clsx(
                "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white shadow-soft"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )
            }
          >
            <span className="flex items-center gap-3">
              <item.icon size={18} />
              {item.label}
            </span>
            {!!item.badge && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-semibold text-white">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {user.role === "SUPER_ADMIN" && (
        <div className="border-t border-white/10 p-3">
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            className={({ isActive }) =>
              clsx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white shadow-soft"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              )
            }
          >
            <IconSettings size={18} />
            Settings
          </NavLink>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-gray-900/50" onClick={onCloseMobile} />
          <div className="relative z-10 h-full w-64">{content}</div>
        </div>
      )}
    </>
  );
}
