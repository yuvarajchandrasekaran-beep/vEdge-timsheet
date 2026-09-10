import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useAuth } from "../hooks/useAuth";
import { usePageHeader } from "../hooks/usePageHeader";
import { useCurrentWeekStart } from "../hooks/useCurrentWeek";
import { useMyTimesheet, useTimesheetHistory } from "../hooks/useTimesheets";
import { useApprovalsPending } from "../hooks/useApprovals";
import { useProjects } from "../hooks/useProjects";
import { useNotifications } from "../hooks/useNotifications";
import { StatCard } from "../components/common/StatCard";
import { ProgressBar } from "../components/common/ProgressBar";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { StatusBadge } from "../components/common/Badge";
import { IconBell, IconCheckSquare, IconClock, IconFolder, IconInfo, IconPlus } from "../components/common/icons";
import { formatHoursMinutes } from "../utils/format";
import { WEEKLY_HOUR_LIMIT } from "../utils/validation";

const DONUT_COLORS = ["#1B4298", "#9DDCF9"];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  usePageHeader(`${greeting()}, ${user?.name?.split(" ")[0] ?? ""}`, "Here's what's happening with your time this week.");
  const weekStart = useCurrentWeekStart();
  const isApprover = user?.role === "PROJECT_ADMIN" || user?.role === "HR_ADMIN" || user?.role === "SUPER_ADMIN";
  const isOrgAdmin = user?.role === "SUPER_ADMIN" || user?.role === "HR_ADMIN";
  const approvalLevel = user?.role === "HR_ADMIN" ? "L2" : "L1";

  const timesheetQuery = useMyTimesheet(weekStart);
  const approvalsQuery = useApprovalsPending({ level: approvalLevel, page: 1, pageSize: 1 }, isApprover);
  const historyQuery = useTimesheetHistory(12);
  const projectsQuery = useProjects({ status: "ACTIVE", page: 1, pageSize: 100 });
  const notificationsQuery = useNotifications(true);

  const myPendingApprovalCount = useMemo(() => {
    if (!historyQuery.data) return 0;
    return historyQuery.data.filter((t) => t.status === "SUBMITTED" || t.status === "APPROVED_L1").length;
  }, [historyQuery.data]);

  const activeProjectsCount = projectsQuery.data?.meta.total ?? 0;
  const distinctClients = useMemo(() => {
    if (!projectsQuery.data) return 0;
    return new Set(projectsQuery.data.data.map((p) => p.clientId)).size;
  }, [projectsQuery.data]);

  const timesheet = timesheetQuery.data;
  const logged = timesheet?.totalHours ?? 0;
  const scheduled = WEEKLY_HOUR_LIMIT;
  const remaining = Math.max(0, scheduled - logged);

  const topProjects = useMemo(() => {
    if (!timesheet) return [];
    const byProject = new Map<string, { name: string; hours: number }>();
    for (const entry of timesheet.entries) {
      const existing = byProject.get(entry.projectId);
      if (existing) existing.hours += entry.hours;
      else byProject.set(entry.projectId, { name: entry.projectName, hours: entry.hours });
    }
    return Array.from(byProject.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }, [timesheet]);
  const maxProjectHours = topProjects[0]?.hours || 1;

  const announcement = useMemo(() => {
    return notificationsQuery.data?.find((n) => n.type === "ANNOUNCEMENT" || n.type === "SYSTEM");
  }, [notificationsQuery.data]);

  if (timesheetQuery.isLoading) return <LoadingBlock label="Loading your dashboard…" />;
  if (timesheetQuery.isError) return <ErrorState error={timesheetQuery.error} onRetry={() => timesheetQuery.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => navigate("/timesheets/day")}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-brand-primary-dark"
        >
          <IconPlus size={16} />
          Quick Log Time
        </button>
      </div>

      {announcement && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3.5">
          <IconInfo size={18} className="mt-0.5 shrink-0 text-status-info" />
          <div>
            <p className="text-sm font-semibold text-sky-900">{announcement.title}</p>
            <p className="text-sm text-sky-800">{announcement.message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="My Timesheet"
          value={formatHoursMinutes(logged)}
          sublabel={timesheet ? <StatusBadge status={timesheet.status} kind="timesheet" /> : "No data yet"}
          icon={<IconClock size={20} />}
          tone="brand"
        />
        <StatCard
          label="Approvals Pending"
          value={isApprover ? approvalsQuery.data?.meta.total ?? "—" : myPendingApprovalCount}
          sublabel={
            isApprover
              ? (approvalsQuery.data?.meta.total ?? 0) > 0
                ? "Requires Action"
                : "All caught up"
              : myPendingApprovalCount > 0
                ? "Awaiting approval"
                : "None outstanding"
          }
          icon={<IconCheckSquare size={20} />}
          tone="warning"
        />
        <StatCard
          label="Projects Active"
          value={activeProjectsCount}
          sublabel={distinctClients ? `across ${distinctClients} client${distinctClients === 1 ? "" : "s"}` : undefined}
          icon={<IconFolder size={20} />}
          tone="info"
        />
        <StatCard
          label="Notifications Unread"
          value={notificationsQuery.data?.length ?? 0}
          sublabel={isOrgAdmin ? "Org-wide" : "For you"}
          icon={<IconBell size={20} />}
          tone="danger"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Timesheet Status</h2>
            {timesheet && <StatusBadge status={timesheet.status} kind="timesheet" />}
          </div>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Logged", value: logged || 0.0001 },
                      { name: "Remaining", value: remaining || 0.0001 },
                    ]}
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {DONUT_COLORS.map((color, i) => (
                      <Cell key={color} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-gray-900">{formatHoursMinutes(scheduled)}</span>
                <span className="text-xs text-gray-500">Scheduled</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <LegendRow color={DONUT_COLORS[0]} label="Logged" value={formatHoursMinutes(logged)} />
              <LegendRow color={DONUT_COLORS[1]} label="Remaining" value={formatHoursMinutes(remaining)} />
              <LegendRow color="#CBD5E1" label="Scheduled" value={formatHoursMinutes(scheduled)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">My Top Projects This Week</h2>
          {topProjects.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No hours logged yet this week.</p>
          ) : (
            <div className="space-y-4">
              {topProjects.map((p) => (
                <div key={p.name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{p.name}</span>
                    <span className="text-gray-500">{formatHoursMinutes(p.hours)}</span>
                  </div>
                  <ProgressBar pct={(p.hours / maxProjectHours) * 100} tone="brand" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-gray-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
