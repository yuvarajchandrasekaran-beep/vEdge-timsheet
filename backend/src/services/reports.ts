import { prisma } from "../lib/prisma";
import { ReportKey, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { sumEstimatedHours } from "../utils/projectHours";

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: number;
  projectId?: number;
  departmentId?: number;
  userId?: number;
  status?: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// UTC day arithmetic, per SCHEMA_REFERENCE.md's rule for the date-only
// columns (weekStartDate, entryDate are stored as UTC midnight).
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${MONTH_ABBR[Number(m) - 1]}-${y}`;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Human-readable date+time for report cells — a raw `Date` object serialized
// via String()/CSV/PDF falls back to its JS toString() ("Thu Sep 10 2026
// 23:48:08 GMT-0500 (Central Daylight Time)"), which is what every export
// format (PDF, CSV) was actually showing before this existed.
function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dateRangeWhere(filters: ReportFilters) {
  const where: any = {};
  if (filters.dateFrom || filters.dateTo) {
    where.gte = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
    where.lte = filters.dateTo ? new Date(filters.dateTo) : undefined;
  }
  return Object.keys(where).length ? where : undefined;
}

export async function getReportData(reportKey: ReportKey, filters: ReportFilters) {
  switch (reportKey) {
    case "timesheet-summary": {
      const entries = await prisma.timesheetEntry.findMany({
        where: {
          entryDate: dateRangeWhere(filters),
          projectTask: { projectId: filters.projectId, project: { clientId: filters.clientId } },
          timesheet: {
            userId: filters.userId,
            status: filters.status,
            user: { departmentId: filters.departmentId },
          },
        },
        include: { projectTask: { include: { project: { include: { client: true } } } }, timesheet: { include: { user: true } } },
        orderBy: { entryDate: "desc" },
      });
      return entries.map((e) => ({
        employeeId: e.timesheet.user.employeeId,
        employee: e.timesheet.user.name,
        client: e.projectTask.project.client.name,
        project: e.projectTask.project.name,
        task: e.projectTask.name,
        date: toIsoDate(e.entryDate),
        hours: e.hours,
        status: e.timesheet.status,
        notes: e.notes ?? "",
      }));
    }

    case "project-utilization": {
      const projects = await prisma.project.findMany({
        where: { id: filters.projectId, clientId: filters.clientId },
        include: { client: true, tasks: { include: { timesheetEntries: { where: { entryDate: dateRangeWhere(filters) } } } } },
      });
      return projects.map((p) => {
        const budgetHours = sumEstimatedHours(p.tasks);
        const loggedHours = p.tasks.reduce((sum, t) => sum + t.timesheetEntries.reduce((s, e) => s + e.hours, 0), 0);
        const utilizationPct = budgetHours > 0 ? Math.round((loggedHours / budgetHours) * 100) : 0;
        return {
          project: p.name,
          client: p.client.name,
          status: p.status,
          budgetHours,
          loggedHours: Math.round(loggedHours * 100) / 100,
          utilizationPct,
        };
      });
    }

    case "approval-compliance": {
      // Single-level approval model (see services/approvalRouting.ts) — a
      // timesheet has at most one real decision now, not a Level 1/Level 2
      // pair, so this reports on "who decided it and how long that took"
      // instead of the old two-stage timing breakdown.
      const timesheets = await prisma.timesheet.findMany({
        where: { submittedAt: { not: null }, status: filters.status },
        include: { user: true, approvals: { include: { approver: true }, orderBy: { actedAt: "asc" } } },
        orderBy: { submittedAt: "desc" },
        take: 200,
      });
      return timesheets.map((t) => {
        const decision = t.approvals[0];
        // Only a still-SUBMITTED timesheet is actually "pending" — a
        // synthetic historical row from seed.ts's backfillProjectHistory()
        // can be APPROVED with no matching Approval record at all, and that
        // must never be reported as pending/SLA-breached just because
        // `decision` happens to be undefined.
        const isPending = t.status === "SUBMITTED";
        const pendingDays =
          isPending && t.submittedAt ? Math.floor((Date.now() - t.submittedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        const daysToDecide =
          decision && t.submittedAt
            ? Math.round(((decision.actedAt.getTime() - t.submittedAt.getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10
            : null;
        return {
          employeeId: t.user.employeeId,
          employee: t.user.name,
          weekStartDate: toIsoDate(t.weekStartDate),
          status: t.status,
          submittedAt: formatDateTime(t.submittedAt),
          approver: decision?.approver.name ?? (isPending ? "Pending" : "—"),
          daysToDecide,
          pendingDays,
          slaBreached: isPending && pendingDays > 3,
        };
      });
    }

    case "missing-timesheets": {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE", role: { name: "INDIVIDUAL_USER" }, departmentId: filters.departmentId },
        include: { timesheets: { where: { weekStartDate: dateRangeWhere(filters) ? { gte: new Date(filters.dateFrom!), lte: new Date(filters.dateTo!) } : undefined } }, department: true },
      });
      return users
        .filter((u) => u.timesheets.every((t) => t.status === "DRAFT"))
        .map((u) => ({
          employeeId: u.employeeId,
          employee: u.name,
          department: u.department?.name ?? "—",
          weekStartDate: filters.dateFrom ?? "current week",
          daysOverdue: filters.dateTo ? Math.max(0, Math.floor((Date.now() - new Date(filters.dateTo).getTime()) / (1000 * 60 * 60 * 24))) : 0,
        }));
    }

    case "overtime": {
      const entries = await prisma.timesheetEntry.findMany({
        where: { hours: { gt: 8 }, entryDate: dateRangeWhere(filters) },
        include: { projectTask: { include: { project: true } }, timesheet: { include: { user: true } } },
        orderBy: { hours: "desc" },
        take: 200,
      });
      return entries.map((e) => ({
        employee: e.timesheet.user.name,
        date: toIsoDate(e.entryDate),
        project: e.projectTask.project.name,
        hours: e.hours,
        thresholdExceeded: "Daily > 8h",
      }));
    }

    case "client-audit": {
      if (!filters.clientId) return [];
      const entries = await prisma.timesheetEntry.findMany({
        where: {
          entryDate: dateRangeWhere(filters),
          projectTask: { projectId: filters.projectId, project: { clientId: filters.clientId } },
          timesheet: { status: filters.status },
        },
        include: {
          projectTask: { include: { project: { include: { client: true } } } },
          timesheet: { include: { user: { include: { role: true } } } },
        },
        orderBy: { entryDate: "asc" },
      });
      return entries
        .map((e) => ({
          client: e.projectTask.project.client.name,
          project: e.projectTask.project.name,
          projectCode: e.projectTask.project.code,
          employeeId: e.timesheet.user.employeeId,
          employee: e.timesheet.user.name,
          role: e.timesheet.user.role.name,
          task: e.projectTask.name,
          date: toIsoDate(e.entryDate),
          hours: e.hours,
          timesheetStatus: e.timesheet.status,
          notes: e.notes ?? "",
        }))
        .sort(
          (a, b) =>
            a.project.localeCompare(b.project) || a.employee.localeCompare(b.employee) || a.date.localeCompare(b.date)
        );
    }

    case "audit-trail": {
      const logs = await prisma.auditLog.findMany({
        where: { actorId: filters.userId, createdAt: dateRangeWhere(filters) },
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      return logs.map((l) => ({
        timestamp: formatDateTime(l.createdAt),
        actor: l.actor?.name ?? "System",
        entityType: l.entityType,
        entityId: l.entityId,
        action: l.action,
      }));
    }

    // Flat, export-matching equivalent of getWeeklySummaryReport's grouped
    // shape (same "employee row, then a Month Total row" layout Jeff's
    // example used) — see that function's docstring for why both exist.
    case "weekly-summary": {
      const { employees } = await getWeeklySummaryReport(filters);
      const rows: Record<string, unknown>[] = [];
      for (const emp of employees) {
        for (const month of emp.months) {
          for (const w of month.weeks) {
            rows.push({
              employeeId: emp.employeeId,
              employee: emp.name,
              jobTitle: emp.jobTitle,
              weekStart: w.weekStart,
              weekEnd: w.weekEnd,
              billableHours: w.billableHours,
              remarks: w.remarks,
            });
          }
          rows.push({
            employeeId: "",
            employee: "",
            jobTitle: "",
            weekStart: "",
            weekEnd: `${month.month} Total`,
            billableHours: month.monthTotal,
            remarks: "",
          });
        }
      }
      return rows;
    }

    // Flat equivalent of getDailyTimesheetReport's per-(employee,week) sheets
    // — one row per calendar day instead of one page per sheet, for CSV/XLSX
    // (the PDF export renders the actual signature-sheet layout instead).
    case "daily-timesheet": {
      const { sheets } = await getDailyTimesheetReport(filters);
      const rows: Record<string, unknown>[] = [];
      for (const sheet of sheets) {
        sheet.days.forEach((d, i) => {
          rows.push({
            employee: sheet.employeeName,
            manager: sheet.manager,
            weekEnding: sheet.weekEnd,
            day: DAY_NAMES[i],
            date: d.date,
            projectName: d.projectName,
            task: d.task,
            billableHours: d.billableHours,
            nonBillableHours: d.nonBillableHours,
            total: Math.round((d.billableHours + d.nonBillableHours) * 100) / 100,
          });
        });
      }
      return rows;
    }

    default:
      return [];
  }
}

/**
 * Client-facing "proof of hours" report: every project under a client, each
 * project's contributing resources, and the hours each resource logged.
 * Powers the on-screen preview for the "client-audit" report — the
 * entry-level line items for its CSV/XLSX/PDF export come from
 * getReportData("client-audit", ...) above instead.
 */
export async function getClientAuditReport(filters: ReportFilters) {
  if (!filters.clientId) {
    return { client: null, projects: [], grandTotalHours: 0, grandTotalResources: 0 };
  }

  const client = await prisma.client.findUnique({ where: { id: filters.clientId } });
  const projects = await prisma.project.findMany({
    where: { clientId: filters.clientId, id: filters.projectId },
    orderBy: { name: "asc" },
  });

  const projectRows = await Promise.all(
    projects.map(async (p) => {
      const entries = await prisma.timesheetEntry.findMany({
        where: {
          entryDate: dateRangeWhere(filters),
          projectTask: { projectId: p.id },
          timesheet: { status: filters.status },
        },
        include: { timesheet: { include: { user: { include: { role: true } } } } },
      });

      const byUser = new Map<number, { user: (typeof entries)[number]["timesheet"]["user"]; totalHours: number; entryCount: number }>();
      for (const e of entries) {
        const u = e.timesheet.user;
        const existing = byUser.get(u.id);
        if (existing) {
          existing.totalHours += e.hours;
          existing.entryCount += 1;
        } else {
          byUser.set(u.id, { user: u, totalHours: e.hours, entryCount: 1 });
        }
      }

      const resources = [...byUser.values()]
        .map((r) => ({
          userId: String(r.user.id),
          employeeId: r.user.employeeId,
          name: r.user.name,
          role: r.user.role.name,
          totalHours: Math.round(r.totalHours * 100) / 100,
          entryCount: r.entryCount,
        }))
        .sort((a, b) => b.totalHours - a.totalHours);

      const projectTotalHours = Math.round(resources.reduce((s, r) => s + r.totalHours, 0) * 100) / 100;

      return {
        projectId: String(p.id),
        projectName: p.name,
        code: p.code,
        status: p.status,
        resources,
        projectTotalHours,
      };
    })
  );

  const grandTotalHours = Math.round(projectRows.reduce((s, p) => s + p.projectTotalHours, 0) * 100) / 100;
  const grandTotalResources = new Set(projectRows.flatMap((p) => p.resources.map((r) => r.userId))).size;

  return {
    client: client ? { id: String(client.id), name: client.name } : null,
    projects: projectRows,
    grandTotalHours,
    grandTotalResources,
  };
}

/**
 * One row per employee per week they logged *billable* time, grouped under
 * each employee and then by the month their week starts in (with a subtotal
 * row) — the exact layout a PM has historically built by hand in Excel to
 * send a client for timesheet approval (see RELEASE_NOTES.md). "Remarks" is
 * that week's own week-notes comment, if any. Non-billable time (PTO,
 * internal admin, etc.) is deliberately excluded — this is a billing-hours
 * view, not a full activity log. Powers the on-screen preview; the flat,
 * export-matching rows (same employee/month-total rows, one per line
 * instead of nested) come from getReportData("weekly-summary", ...).
 */
export async function getWeeklySummaryReport(filters: ReportFilters) {
  const entries = await prisma.timesheetEntry.findMany({
    where: {
      entryDate: dateRangeWhere(filters),
      projectTask: { projectId: filters.projectId, project: { clientId: filters.clientId } },
      timesheet: { userId: filters.userId, status: filters.status, user: { departmentId: filters.departmentId } },
    },
    include: { projectTask: true, timesheet: { include: { user: true } } },
  });

  interface WeekAgg {
    weekStart: string;
    weekEnd: string;
    billableHours: number;
    remarks: string;
  }
  const byUser = new Map<number, { user: (typeof entries)[number]["timesheet"]["user"]; weeks: Map<string, WeekAgg> }>();

  for (const e of entries) {
    const u = e.timesheet.user;
    if (!byUser.has(u.id)) byUser.set(u.id, { user: u, weeks: new Map() });
    const agg = byUser.get(u.id)!;
    const weekStart = toIsoDate(e.timesheet.weekStartDate);
    if (!agg.weeks.has(weekStart)) {
      agg.weeks.set(weekStart, {
        weekStart,
        weekEnd: toIsoDate(addDays(e.timesheet.weekStartDate, 6)),
        billableHours: 0,
        remarks: e.timesheet.weekNotes ?? "",
      });
    }
    if (e.projectTask.billable) agg.weeks.get(weekStart)!.billableHours += e.hours;
  }

  const employees = [...byUser.values()]
    .map(({ user, weeks }) => {
      const weekList = [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      const byMonth = new Map<string, { month: string; weeks: WeekAgg[]; monthTotal: number }>();
      for (const w of weekList) {
        // Grouped by the month the week STARTS in, even when the week's own
        // end date crosses into the next month — matches how the example
        // this mirrors counted a straddling week entirely under one month.
        const monthKey = w.weekStart.slice(0, 7);
        if (!byMonth.has(monthKey)) byMonth.set(monthKey, { month: monthLabel(w.weekStart), weeks: [], monthTotal: 0 });
        const m = byMonth.get(monthKey)!;
        m.weeks.push({ ...w, billableHours: Math.round(w.billableHours * 100) / 100 });
        m.monthTotal = Math.round((m.monthTotal + w.billableHours) * 100) / 100;
      }
      const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
      const grandTotal = Math.round(months.reduce((s, m) => s + m.monthTotal, 0) * 100) / 100;
      return {
        userId: String(user.id),
        employeeId: user.employeeId,
        name: user.name,
        jobTitle: user.jobTitle ?? "—",
        months,
        grandTotal,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { employees };
}

const MAX_DAILY_TIMESHEET_SHEETS = 60;

/**
 * One "sheet" per employee per week they logged any time — day-by-day
 * (Monday-Sunday, every day present even if empty) with billable/
 * non-billable hours split per day, the resolved manager (that week's
 * busiest project's Project Admin, falling back to the employee's own
 * reporting manager), and a week total — the data behind the printable,
 * client-signable timesheet format (see RELEASE_NOTES.md). The PDF export
 * renders one literal page per sheet, reproducing that layout; CSV/XLSX get
 * the flat one-row-per-day equivalent via getReportData("daily-timesheet").
 * Capped at MAX_DAILY_TIMESHEET_SHEETS sheets — this is meant to be run
 * scoped to one client/project and a short date range, not the whole org's
 * history at once.
 */
export async function getDailyTimesheetReport(filters: ReportFilters) {
  const entries = await prisma.timesheetEntry.findMany({
    where: {
      entryDate: dateRangeWhere(filters),
      projectTask: { projectId: filters.projectId, project: { clientId: filters.clientId } },
      timesheet: { userId: filters.userId, status: filters.status, user: { departmentId: filters.departmentId } },
    },
    include: {
      projectTask: {
        include: {
          project: { include: { members: { where: { roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN }, include: { user: true } } } },
        },
      },
      timesheet: { include: { user: { include: { manager: true } } } },
    },
    orderBy: { entryDate: "asc" },
  });

  interface DayAgg {
    projects: Set<string>;
    tasks: Set<string>;
    billable: number;
    nonBillable: number;
  }
  interface SheetAgg {
    user: (typeof entries)[number]["timesheet"]["user"];
    weekStart: string;
    days: Map<string, DayAgg>;
    projectCounts: Map<number, number>;
    projectAdminNames: Map<number, string[]>;
  }
  const byUserWeek = new Map<string, SheetAgg>();

  for (const e of entries) {
    const u = e.timesheet.user;
    const weekStart = toIsoDate(e.timesheet.weekStartDate);
    const key = `${u.id}:${weekStart}`;
    if (!byUserWeek.has(key)) {
      byUserWeek.set(key, { user: u, weekStart, days: new Map(), projectCounts: new Map(), projectAdminNames: new Map() });
    }
    const agg = byUserWeek.get(key)!;
    const dateIso = toIsoDate(e.entryDate);
    if (!agg.days.has(dateIso)) agg.days.set(dateIso, { projects: new Set(), tasks: new Set(), billable: 0, nonBillable: 0 });
    const day = agg.days.get(dateIso)!;
    const project = e.projectTask.project;
    day.projects.add(project.name);
    day.tasks.add(e.projectTask.name);
    if (e.projectTask.billable) day.billable += e.hours;
    else day.nonBillable += e.hours;
    agg.projectCounts.set(project.id, (agg.projectCounts.get(project.id) ?? 0) + 1);
    if (!agg.projectAdminNames.has(project.id)) {
      agg.projectAdminNames.set(project.id, project.members.map((m) => m.user.name));
    }
  }

  const allSheets = [...byUserWeek.values()].sort(
    (a, b) => a.user.name.localeCompare(b.user.name) || a.weekStart.localeCompare(b.weekStart)
  );
  const truncated = allSheets.length > MAX_DAILY_TIMESHEET_SHEETS;

  const sheets = allSheets.slice(0, MAX_DAILY_TIMESHEET_SHEETS).map((agg) => {
    const weekStartDate = new Date(`${agg.weekStart}T00:00:00.000Z`);
    const days = [...Array(7)].map((_, i) => {
      const dateIso = toIsoDate(addDays(weekStartDate, i));
      const d = agg.days.get(dateIso);
      return {
        date: dateIso,
        projectName: d ? [...d.projects].join(", ") : "",
        task: d ? [...d.tasks].join(", ") : "",
        billableHours: Math.round((d?.billable ?? 0) * 100) / 100,
        nonBillableHours: Math.round((d?.nonBillable ?? 0) * 100) / 100,
      };
    });
    const totalBillable = Math.round(days.reduce((s, d) => s + d.billableHours, 0) * 100) / 100;
    const totalNonBillable = Math.round(days.reduce((s, d) => s + d.nonBillableHours, 0) * 100) / 100;

    const winningEntry = [...agg.projectCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const manager = (winningEntry ? agg.projectAdminNames.get(winningEntry[0])?.[0] : undefined) ?? agg.user.manager?.name ?? "—";

    return {
      userId: String(agg.user.id),
      employeeName: agg.user.name,
      employeeEmail: agg.user.email,
      manager,
      weekStart: agg.weekStart,
      weekEnd: toIsoDate(addDays(weekStartDate, 6)),
      days,
      totalBillable,
      totalNonBillable,
      totalHours: Math.round((totalBillable + totalNonBillable) * 100) / 100,
    };
  });

  return { sheets, truncated, totalSheets: allSheets.length };
}

export async function getUtilizationChartData(filters: ReportFilters = {}) {
  const projects = await prisma.project.findMany({
    where: { id: filters.projectId, clientId: filters.clientId },
    include: { tasks: { include: { timesheetEntries: { where: { entryDate: dateRangeWhere(filters) } } } } },
  });
  const donut = projects.map((p) => {
    const budgetHours = sumEstimatedHours(p.tasks);
    const loggedHours = p.tasks.reduce((sum, t) => sum + t.timesheetEntries.reduce((s, e) => s + e.hours, 0), 0);
    const utilizationPct = budgetHours > 0 ? Math.round((loggedHours / budgetHours) * 100) : 0;
    return { project: p.name, utilizationPct };
  });

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      entryDate: dateRangeWhere(filters),
      projectTask: { projectId: filters.projectId, project: { clientId: filters.clientId } },
    },
    orderBy: { entryDate: "asc" },
  });
  const byWeek = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.entryDate);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = toIsoDate(monday);
    byWeek.set(key, (byWeek.get(key) ?? 0) + e.hours);
  }
  const trend = [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, hours]) => ({ week, hours }));

  return { donut, trend };
}

/**
 * Project-utilization rows/trend/summary in the exact shape the Reports
 * screen's charts and table expect (ProjectUtilizationRow[] / {label,value}[]).
 * The screen renders this same shape regardless of which reportKey is
 * selected — see SCHEMA_REFERENCE.md "Reports" for why — so this is what
 * backs GET /reports/:reportKey's JSON preview for every key. The real,
 * report-specific column data (timesheet-summary, audit-trail, etc.) is
 * still used for CSV/XLSX/PDF export via getReportData above.
 */
export async function getUtilizationOverview(filters: ReportFilters) {
  const rows = (await getReportData("project-utilization", filters)) as {
    project: string;
    client: string;
    budgetHours: number;
    loggedHours: number;
    utilizationPct: number;
  }[];

  const projectIds = await prisma.project.findMany({ where: { id: filters.projectId, clientId: filters.clientId }, select: { id: true, name: true } });
  const idByName = new Map(projectIds.map((p) => [p.name, p.id]));

  const utilizationByProject = rows.map((r) => ({
    projectId: idByName.get(r.project) ?? 0,
    projectName: r.project,
    clientName: r.client,
    budgetHours: r.budgetHours,
    loggedHours: r.loggedHours,
    utilizationPct: r.utilizationPct,
  }));

  const { trend: rawTrend } = await getUtilizationChartData(filters);
  const trend = rawTrend.map((t) => ({ label: t.week, value: Math.round(t.hours * 100) / 100 }));

  const totalBudgetHours = rows.reduce((s, r) => s + r.budgetHours, 0);
  const totalLoggedHours = rows.reduce((s, r) => s + r.loggedHours, 0);
  const summary = {
    totalProjects: rows.length,
    totalBudgetHours: Math.round(totalBudgetHours * 100) / 100,
    totalLoggedHours: Math.round(totalLoggedHours * 100) / 100,
    avgUtilizationPct: rows.length ? Math.round(rows.reduce((s, r) => s + r.utilizationPct, 0) / rows.length) : 0,
  };

  return { summary, utilizationByProject, trend, rows: utilizationByProject };
}
