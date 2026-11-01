import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useReport,
  useClientAuditReport,
  useWeeklySummaryReport,
  useDailyTimesheetReport,
  useExportReport,
  useScheduleReport,
} from "../hooks/useReports";
import { useAuth } from "../hooks/useAuth";
import { usePageHeader } from "../hooks/usePageHeader";
import { useClients } from "../hooks/useProjects";
import { useDepartments } from "../hooks/useDepartments";
import { getApiErrorMessage } from "../api/client";
import type { ReportFilters, ReportKey, ProjectUtilizationRow, WeeklySummaryEmployee } from "../types";
import { ROLE_LABELS } from "../types";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { ProgressBar } from "../components/common/ProgressBar";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { Spinner } from "../components/common/Spinner";
import { IconBarChart, IconChevronDown, IconDownload, IconSettings } from "../components/common/icons";
import { formatDate, humanizeHeader, formatReportCell } from "../utils/format";
import clsx from "clsx";

const REPORT_OPTIONS: { value: ReportKey; label: string }[] = [
  { value: "project-utilization", label: "Project Utilization" },
  { value: "timesheet-summary", label: "Timesheet Summary" },
  { value: "approval-compliance", label: "Approval Compliance" },
  { value: "missing-timesheets", label: "Missing Timesheets" },
  { value: "overtime", label: "Overtime" },
  { value: "audit-trail", label: "Audit Trail" },
  { value: "client-audit", label: "Client Audit Report" },
  { value: "weekly-summary", label: "Weekly Summary by Employee" },
  { value: "daily-timesheet", label: "Daily Timesheet" },
];

// Mirrors backend/src/routes/reports.ts's INDIVIDUAL_USER_REPORT_KEYS — the
// rest are org/manager-level views (approval-compliance, missing-timesheets,
// audit-trail, client-audit) an Individual User's own-data-only access
// doesn't cover, so they're hidden here rather than offered and then 403'd.
const INDIVIDUAL_USER_REPORT_KEYS: ReadonlySet<ReportKey> = new Set(["timesheet-summary", "overtime", "project-utilization"]);

const DONUT_PALETTE = ["#1B4298", "#00AEEF", "#9DDCF9", "#16A34A", "#F59E0B", "#94A3B8"];

function defaultFilters(): ReportFilters {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const isIndividualUser = hasRole("INDIVIDUAL_USER");
  usePageHeader(
    "Reports & Analytics",
    isIndividualUser ? "Your own timesheet and overtime history" : "Organization-wide utilization, compliance and audit reporting"
  );
  const reportOptions = isIndividualUser
    ? REPORT_OPTIONS.filter((o) => INDIVIDUAL_USER_REPORT_KEYS.has(o.value))
    : REPORT_OPTIONS;
  const [reportKey, setReportKey] = useState<ReportKey>("project-utilization");
  const [draft, setDraft] = useState<ReportFilters>(defaultFilters());
  const [applied, setApplied] = useState<ReportFilters>(draft);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  function handleGenerate() {
    if (draft.dateFrom && draft.dateTo && draft.dateTo < draft.dateFrom) {
      setDateError("To date must be on or after the From date.");
      return;
    }
    setDateError(null);
    setApplied(draft);
  }

  const isClientAudit = reportKey === "client-audit";
  const isWeeklySummary = reportKey === "weekly-summary";
  const isDailyTimesheet = reportKey === "daily-timesheet";
  const usesSpecializedView = isClientAudit || isWeeklySummary || isDailyTimesheet;
  // GET /clients 403s for an Individual User — skip the call for them rather
  // than firing a request that's guaranteed to fail.
  const { data: clients } = useClients(!isIndividualUser);
  const { data: departments } = useDepartments();
  const reportQuery = useReport(reportKey, applied, !usesSpecializedView);
  const clientAuditQuery = useClientAuditReport(applied, isClientAudit);
  const weeklySummaryQuery = useWeeklySummaryReport(applied, isWeeklySummary);
  const dailyTimesheetQuery = useDailyTimesheetReport(applied, isDailyTimesheet);
  const exportMutation = useExportReport();
  // Which columns (and in what order) the generic table/export should use —
  // only meaningful for the dynamic-column reports; null means "use
  // everything, in the server's own order" (every report before this existed
  // behaved exactly that way, so that's the no-op default).
  const [exportColumns, setExportColumns] = useState<string[] | null>(null);
  useEffect(() => setExportColumns(null), [reportKey]);

  const report = reportQuery.data;

  const donutData = useMemo(
    () => (report?.utilizationByProject ?? []).map((p) => ({ name: p.projectName, value: p.loggedHours })),
    [report]
  );

  return (
    <div className="space-y-5">
      {!isIndividualUser && (
        <div className="flex justify-end">
          <button onClick={() => setScheduleOpen(true)} className="btn-secondary">
            <IconBarChart size={16} />
            Schedule Report
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <FilterField label="Report type">
            <select value={reportKey} onChange={(e) => setReportKey(e.target.value as ReportKey)} className="input">
              {reportOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="From">
            <input type="date" value={draft.dateFrom} onChange={(e) => setDraft((f) => ({ ...f, dateFrom: e.target.value }))} className="input" />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={draft.dateTo} onChange={(e) => setDraft((f) => ({ ...f, dateTo: e.target.value }))} className="input" />
          </FilterField>
          {!isIndividualUser && (
            <FilterField label="Client">
              <select value={draft.clientId ?? ""} onChange={(e) => setDraft((f) => ({ ...f, clientId: e.target.value || undefined }))} className="input">
                <option value="">All clients</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
          <FilterField label="Department">
            <select
              value={draft.departmentId ?? ""}
              onChange={(e) => setDraft((f) => ({ ...f, departmentId: e.target.value || undefined }))}
              className="input"
            >
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Group by">
            <select value={draft.groupBy ?? "project"} onChange={(e) => setDraft((f) => ({ ...f, groupBy: e.target.value }))} className="input">
              <option value="project">Project</option>
              <option value="department">Department</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </FilterField>
        </div>
        {dateError && <p className="mt-3 text-sm text-status-danger">{dateError}</p>}
        <div className="mt-3 flex justify-end">
          <button onClick={handleGenerate} className="btn-primary">
            Generate
          </button>
        </div>
      </div>

      {isClientAudit ? (
        <ClientAuditSection
          query={clientAuditQuery}
          hasClient={!!applied.clientId}
          onExport={(format) => exportMutation.mutate({ reportKey, format, filters: applied })}
          exporting={exportMutation.isPending}
        />
      ) : isWeeklySummary ? (
        <WeeklySummarySection
          query={weeklySummaryQuery}
          onExport={(format) => exportMutation.mutate({ reportKey, format, filters: applied })}
          exporting={exportMutation.isPending}
        />
      ) : isDailyTimesheet ? (
        <DailyTimesheetSection
          query={dailyTimesheetQuery}
          onExport={(format) => exportMutation.mutate({ reportKey, format, filters: applied })}
          exporting={exportMutation.isPending}
        />
      ) : reportQuery.isLoading ? (
        <LoadingBlock label="Generating report…" />
      ) : reportQuery.isError ? (
        <ErrorState error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      ) : !report || report.rows.length === 0 ? (
        <EmptyState title="No data for this report" description="Try widening your date range or clearing filters." />
      ) : (
        <>
          {reportKey === "project-utilization" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">Utilization by Project</h2>
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <div className="h-52 w-52 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={2} stroke="none">
                          {donutData.map((_, i) => (
                            <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `${v.toFixed(1)}h`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2.5">
                    {donutData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-600">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                          {d.name}
                        </span>
                        <span className="font-semibold text-gray-900">{d.value.toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">Utilization Trend</h2>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.trend} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#1B4298" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{REPORT_OPTIONS.find((o) => o.value === reportKey)?.label}</h2>
              <div className="flex gap-2">
                {reportKey !== "project-utilization" && report && (
                  <ColumnsButton
                    reportKey={reportKey}
                    allColumns={Object.keys((report.rows as Record<string, unknown>[])[0] ?? {})}
                    onChange={setExportColumns}
                  />
                )}
                {(["pdf", "xlsx", "csv"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => exportMutation.mutate({ reportKey, format: fmt, filters: applied, columns: exportColumns ?? undefined })}
                    disabled={exportMutation.isPending}
                    className="btn-secondary px-3 py-1.5 text-xs uppercase"
                  >
                    <IconDownload size={13} />
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {reportKey === "project-utilization" ? (
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Budget</th>
                      <th className="px-4 py-3">Logged</th>
                      <th className="px-4 py-3">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.rows as ProjectUtilizationRow[]).map((r) => (
                      <tr key={r.projectId} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.projectName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.clientName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.budgetHours.toFixed(0)}h</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{r.loggedHours.toFixed(0)}h</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ProgressBar pct={r.utilizationPct} className="w-28" />
                            <span className="text-xs text-gray-500">{r.utilizationPct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <GenericReportTable rows={report.rows as Record<string, unknown>[]} columns={exportColumns} />
              )}
            </div>
            <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">
              Generated {report.generatedAt ? formatDate(report.generatedAt, "MMM d, yyyy h:mm a") : "just now"}
            </p>
          </div>
        </>
      )}

      <ScheduleReportModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} reportKey={reportKey} />
    </div>
  );
}

function ClientAuditSection({
  query,
  hasClient,
  onExport,
  exporting,
}: {
  query: ReturnType<typeof useClientAuditReport>;
  hasClient: boolean;
  onExport: (format: "pdf" | "xlsx" | "csv") => void;
  exporting: boolean;
}) {
  if (!hasClient) {
    return <EmptyState title="Select a client" description="Choose a client above, then Generate, to build its audit-proof hours report." />;
  }
  if (query.isLoading) return <LoadingBlock label="Generating report…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const report = query.data;
  if (!report || report.projects.length === 0) {
    return <EmptyState title="No projects for this client" description="Try widening your date range or clearing filters." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{report.client?.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {report.projects.length} {report.projects.length === 1 ? "project" : "projects"} · {report.grandTotalResources}{" "}
              {report.grandTotalResources === 1 ? "resource" : "resources"} · {report.grandTotalHours.toFixed(1)}h total logged
            </p>
          </div>
          <div className="flex gap-2">
            {(["pdf", "xlsx", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => onExport(fmt)}
                disabled={exporting}
                className="btn-secondary px-3 py-1.5 text-xs uppercase"
              >
                <IconDownload size={13} />
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report.projects.map((p) => (
        <div key={p.projectId} className="rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
          <div className="flex flex-col gap-1 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {p.projectName} <span className="font-normal text-gray-400">· {p.code}</span>
            </h3>
            <span className="text-sm font-semibold text-gray-900">{p.projectTotalHours.toFixed(1)}h logged</span>
          </div>
          {p.resources.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No hours logged" description="No timesheet entries for this project in the selected range." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Entries</th>
                    <th className="px-4 py-3 text-right">Hours logged</th>
                  </tr>
                </thead>
                <tbody>
                  {p.resources.map((r) => (
                    <tr key={r.userId} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.employeeId}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.entryCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{r.totalHours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <p className="px-1 text-xs text-gray-400">
        Generated {report.generatedAt ? formatDate(report.generatedAt, "MMM d, yyyy h:mm a") : "just now"}
      </p>
    </div>
  );
}

function WeeklySummarySection({
  query,
  onExport,
  exporting,
}: {
  query: ReturnType<typeof useWeeklySummaryReport>;
  onExport: (format: "pdf" | "xlsx" | "csv") => void;
  exporting: boolean;
}) {
  if (query.isLoading) return <LoadingBlock label="Generating report…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const report = query.data;
  if (!report || report.employees.length === 0) {
    return <EmptyState title="No billable hours for this range" description="Try widening your date range or clearing filters." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Weekly Summary by Employee</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {report.employees.length} {report.employees.length === 1 ? "employee" : "employees"} · billable hours only
            </p>
          </div>
          <div className="flex gap-2">
            {(["pdf", "xlsx", "csv"] as const).map((fmt) => (
              <button key={fmt} onClick={() => onExport(fmt)} disabled={exporting} className="btn-secondary px-3 py-1.5 text-xs uppercase">
                <IconDownload size={13} />
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report.employees.map((emp) => (
        <div key={emp.userId} className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
          <div className="flex items-center justify-between bg-brand-primary px-4 py-2.5">
            <span className="text-sm font-semibold text-white">{emp.name}</span>
            <span className="text-xs text-blue-100">{emp.jobTitle}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5">Week Start</th>
                  <th className="px-4 py-2.5">Week End</th>
                  <th className="px-4 py-2.5 text-right">Billable Hours</th>
                  <th className="px-4 py-2.5">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {emp.months.map((month) => (
                  <Fragment key={month.month}>
                    {month.weeks.map((w) => (
                      <tr key={w.weekStart} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-700">{formatDate(w.weekStart, "d-MMM-yy")}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{formatDate(w.weekEnd, "d-MMM-yy")}</td>
                        <td className="px-4 py-2 text-right text-sm text-gray-700">{w.billableHours}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{w.remarks || "—"}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100 bg-gray-50 font-semibold">
                      <td className="px-4 py-2 text-sm text-gray-700" colSpan={2}>
                        {month.month}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-900">{month.monthTotal}</td>
                      <td />
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="px-1 text-xs text-gray-400">
        Generated {report.generatedAt ? formatDate(report.generatedAt, "MMM d, yyyy h:mm a") : "just now"}
      </p>
    </div>
  );
}

function DailyTimesheetSection({
  query,
  onExport,
  exporting,
}: {
  query: ReturnType<typeof useDailyTimesheetReport>;
  onExport: (format: "pdf" | "xlsx" | "csv") => void;
  exporting: boolean;
}) {
  if (query.isLoading) return <LoadingBlock label="Generating report…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const report = query.data;
  if (!report || report.sheets.length === 0) {
    return <EmptyState title="No time logged for this range" description="Try widening your date range or clearing filters." />;
  }

  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Daily Timesheet</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {report.sheets.length} employee-week {report.sheets.length === 1 ? "sheet" : "sheets"}
              {report.truncated ? ` of ${report.totalSheets} — narrow the filters above to see the rest` : ""} · PDF prints one
              signable page per sheet
            </p>
          </div>
          <div className="flex gap-2">
            {(["pdf", "xlsx", "csv"] as const).map((fmt) => (
              <button key={fmt} onClick={() => onExport(fmt)} disabled={exporting} className="btn-secondary px-3 py-1.5 text-xs uppercase">
                <IconDownload size={13} />
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report.sheets.map((sheet) => (
        <div key={`${sheet.userId}-${sheet.weekStart}`} className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
          <div className="flex flex-col gap-1 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{sheet.employeeName}</h3>
              <p className="text-xs text-gray-500">
                {formatDate(sheet.weekStart, "MMM d")} – {formatDate(sheet.weekEnd, "MMM d, yyyy")} · Manager: {sheet.manager}
              </p>
            </div>
            <span className="text-sm font-semibold text-gray-900">{sheet.totalHours}h total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2 text-right">Billable</th>
                  <th className="px-3 py-2 text-right">Non-Billable</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sheet.days.map((d, i) => (
                  <tr key={d.date} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-700">{DOW[i]}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{formatDate(d.date, "M/d/yy")}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{d.projectName || "—"}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{d.task || "—"}</td>
                    <td className="px-3 py-2 text-right text-sm text-gray-700">{d.billableHours || ""}</td>
                    <td className="px-3 py-2 text-right text-sm text-gray-700">{d.nonBillableHours || ""}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                      {d.billableHours + d.nonBillableHours || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2 text-sm text-gray-700" colSpan={4}>
                    Total hours
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-gray-900">{sheet.totalBillable}</td>
                  <td className="px-3 py-2 text-right text-sm text-gray-900">{sheet.totalNonBillable}</td>
                  <td className="px-3 py-2 text-right text-sm text-gray-900">{sheet.totalHours}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      <p className="px-1 text-xs text-gray-400">
        Generated {report.generatedAt ? formatDate(report.generatedAt, "MMM d, yyyy h:mm a") : "just now"}
      </p>
    </div>
  );
}

/**
 * Renders any report's real rows as a table whose columns are derived from
 * the row data itself — used for every report key except Project
 * Utilization (which keeps its own fixed, chart-paired columns above).
 * Column labels/cell formatting mirror services/pdfTable.ts exactly, so the
 * on-screen preview and the PDF/Excel/CSV export always agree.
 */
const REPORT_PAGE_SIZE = 25;

function isDateLikeKey(key: string): boolean {
  return /date/i.test(key);
}

/** Generic cross-column comparator — numeric strings compare numerically,
 * ISO date strings ("YYYY-MM-DD...") sort correctly as plain strings, and
 * everything else falls back to a locale-aware string compare. Shared by
 * every report's column sort since columns vary per report key. */
function compareReportValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const aStr = String(a).trim();
  const bStr = String(b).trim();
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (aStr !== "" && bStr !== "" && !isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  return aStr.localeCompare(bStr);
}

interface ColumnPref {
  key: string;
  visible: boolean;
}

function loadColumnPrefs(reportKey: ReportKey, allColumns: string[]): ColumnPref[] {
  try {
    const saved = localStorage.getItem(`reports.columns.${reportKey}`);
    if (saved) {
      const parsed: ColumnPref[] = JSON.parse(saved);
      const known = new Set(parsed.map((p) => p.key));
      // Drop any column the report no longer has, and append any new one
      // (visible by default) rather than silently hiding it.
      const merged = parsed.filter((p) => allColumns.includes(p.key));
      for (const c of allColumns) if (!known.has(c)) merged.push({ key: c, visible: true });
      return merged;
    }
  } catch {
    // Cleared/blocked localStorage just means no persisted preference yet.
  }
  return allColumns.map((key) => ({ key, visible: true }));
}

/**
 * Jeff Cockman's "Future Enhancement" ask (see RELEASE_NOTES.md): lets a
 * viewer hide columns they don't need and reorder the rest, remembered
 * per-report-key in localStorage (a per-viewer convenience, like other
 * saved display preferences in this app — never synced or read by the
 * server). The chosen order/visibility also flows into the PDF/Excel/CSV
 * export via the parent's `onChange`, so hiding a column here hides it in
 * what gets downloaded too.
 */
function ColumnsButton({
  reportKey,
  allColumns,
  onChange,
}: {
  reportKey: ReportKey;
  allColumns: string[];
  onChange: (visibleOrdered: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<ColumnPref[]>(() => loadColumnPrefs(reportKey, allColumns));

  function notify(next: ColumnPref[]) {
    const visible = next.filter((p) => p.visible).map((p) => p.key);
    // "Every column, in the default order" is exactly today's pre-existing
    // behavior — pass null so export keeps using the server's own shape
    // rather than a redundant explicit list.
    const isDefault = visible.length === allColumns.length && visible.every((c, i) => c === allColumns[i]);
    onChange(isDefault ? null : visible);
  }

  const allColumnsKey = allColumns.join(",");
  useEffect(() => {
    const next = loadColumnPrefs(reportKey, allColumns);
    setPrefs(next);
    notify(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, allColumnsKey]);

  function persist(next: ColumnPref[]) {
    setPrefs(next);
    try {
      localStorage.setItem(`reports.columns.${reportKey}`, JSON.stringify(next));
    } catch {
      // Per-viewer convenience only — fine if this silently doesn't persist.
    }
    notify(next);
  }

  function toggleVisible(key: string) {
    persist(prefs.map((p) => (p.key === key ? { ...p, visible: !p.visible } : p)));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= prefs.length) return;
    const next = [...prefs];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-secondary px-3 py-1.5 text-xs">
        <IconSettings size={13} />
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Columns</span>
              <button onClick={() => persist(allColumns.map((key) => ({ key, visible: true })))} className="text-xs font-medium text-brand-primary hover:underline">
                Reset
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {prefs.map((p, i) => (
                <div key={p.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={p.visible}
                    onChange={() => toggleVisible(p.key)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                  />
                  <span className="flex-1 truncate text-sm text-gray-700">{humanizeHeader(p.key)}</span>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <IconChevronDown size={12} className="rotate-180" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === prefs.length - 1}
                    aria-label="Move down"
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <IconChevronDown size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GenericReportTable({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] | null }) {
  const allColumns = Object.keys(rows[0] ?? {});
  // `columns`, when set, is the Columns button's chosen subset/order — fall
  // back to every column in the server's own order (today's behavior, and
  // what every report that predates this control still gets).
  const headers = columns && columns.length > 0 ? columns.filter((c) => allColumns.includes(c)) : allColumns;
  const dateKey = headers.find(isDateLikeKey) ?? null;
  // Exports (PDF/Excel/CSV) and the on-screen preview intentionally share
  // the same full, unfiltered `rows` — only how this table *displays* them
  // is paginated, so a large report (Audit Trail especially) isn't one huge
  // scroll-to-see-everything table on screen.
  const [page, setPage] = useState(1);
  // Defaults to the date column, most-recent-first — matches what the
  // backend's own query already orders by, so the initial view and this
  // control's indicator agree; a header click re-sorts from there.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    dateKey ? { key: dateKey, dir: "desc" } : null
  );
  useEffect(() => {
    setPage(1);
    setSort(dateKey ? { key: dateKey, dir: "desc" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      // A fresh click on a date column reads most naturally as "most recent
      // first" rather than the alphabetical-style ascending default used for
      // every other column.
      return { key, dir: isDateLikeKey(key) ? "desc" : "asc" };
    });
  }

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareReportValues(a[sort.key], b[sort.key]) * dir);
  }, [rows, sort]);

  const pageRows = sortedRows.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE);

  return (
    <>
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
            {headers.map((h) => (
              <th
                key={h}
                onClick={() => toggleSort(h)}
                title={`Sort by ${humanizeHeader(h)}`}
                className="group cursor-pointer select-none whitespace-nowrap px-4 py-3 hover:text-gray-600"
              >
                <span className="inline-flex items-center gap-1">
                  {humanizeHeader(h)}
                  <IconChevronDown
                    size={12}
                    className={clsx(
                      "transition-transform",
                      sort?.key === h
                        ? clsx("text-gray-600", sort.dir === "asc" && "rotate-180")
                        : "text-gray-300 opacity-0 group-hover:opacity-100"
                    )}
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {headers.map((h) => (
                <td key={h} className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {formatReportCell(row[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > REPORT_PAGE_SIZE && <Pagination page={page} pageSize={REPORT_PAGE_SIZE} total={rows.length} onPageChange={setPage} />}
    </>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function ScheduleReportModal({ open, onClose, reportKey }: { open: boolean; onClose: () => void; reportKey: ReportKey }) {
  const [cadence, setCadence] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [recipients, setRecipients] = useState("");
  const schedule = useScheduleReport();
  const [done, setDone] = useState(false);

  // Shared by the Modal's own X/backdrop/Escape close AND the footer's
  // "Close" button below — the footer button used to call the raw `onClose`
  // prop directly, which never reset `done`, so reopening the modal (it's
  // always mounted, just hidden) showed the same stale confirmation screen
  // instead of a fresh form until a full page reload remounted it. Also
  // resets the form fields themselves — `done` alone being reset still left
  // the last report's cadence/recipients sitting in a "new" form.
  function handleClose() {
    onClose();
    setDone(false);
    setCadence("WEEKLY");
    setRecipients("");
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule report"
      footer={
        done ? (
          <button onClick={handleClose} className="btn-primary">
            Close
          </button>
        ) : (
          <>
            <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() =>
                schedule.mutate(
                  {
                    reportKey,
                    cadence,
                    recipients: recipients
                      .split(",")
                      .map((r) => r.trim())
                      .filter(Boolean),
                  },
                  { onSuccess: () => setDone(true) }
                )
              }
              disabled={!recipients.trim() || schedule.isPending}
              className="btn-primary"
            >
              {schedule.isPending && <Spinner size={14} className="text-white" />}
              Schedule
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-gray-700">This report is now scheduled and will be emailed to the recipients below.</p>
      ) : (
        <div className="space-y-4">
          <FilterField label="Cadence">
            <select value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} className="input">
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </FilterField>
          <FilterField label="Recipients (comma-separated emails)">
            <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="hr@vivid-edge.com, admin@vivid-edge.com" className="input" />
          </FilterField>
          {schedule.isError && (
            <p className="text-sm text-status-danger">{getApiErrorMessage(schedule.error, "Couldn't schedule this report.")}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
