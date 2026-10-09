import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useReport, useClientAuditReport, useExportReport, useScheduleReport } from "../hooks/useReports";
import { useAuth } from "../hooks/useAuth";
import { usePageHeader } from "../hooks/usePageHeader";
import { useClients } from "../hooks/useProjects";
import { useDepartments } from "../hooks/useDepartments";
import { getApiErrorMessage } from "../api/client";
import type { ReportFilters, ReportKey, ProjectUtilizationRow } from "../types";
import { ROLE_LABELS } from "../types";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { ProgressBar } from "../components/common/ProgressBar";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { Spinner } from "../components/common/Spinner";
import { IconBarChart, IconDownload } from "../components/common/icons";
import { formatDate, humanizeHeader, formatReportCell } from "../utils/format";

const REPORT_OPTIONS: { value: ReportKey; label: string }[] = [
  { value: "project-utilization", label: "Project Utilization" },
  { value: "timesheet-summary", label: "Timesheet Summary" },
  { value: "approval-compliance", label: "Approval Compliance" },
  { value: "missing-timesheets", label: "Missing Timesheets" },
  { value: "overtime", label: "Overtime" },
  { value: "audit-trail", label: "Audit Trail" },
  { value: "client-audit", label: "Client Audit Report" },
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
  // GET /clients 403s for an Individual User — skip the call for them rather
  // than firing a request that's guaranteed to fail.
  const { data: clients } = useClients(!isIndividualUser);
  const { data: departments } = useDepartments();
  const reportQuery = useReport(reportKey, applied, !isClientAudit);
  const clientAuditQuery = useClientAuditReport(applied, isClientAudit);
  const exportMutation = useExportReport();

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
                {(["pdf", "xlsx", "csv"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => exportMutation.mutate({ reportKey, format: fmt, filters: applied })}
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
                <GenericReportTable rows={report.rows as Record<string, unknown>[]} />
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

/**
 * Renders any report's real rows as a table whose columns are derived from
 * the row data itself — used for every report key except Project
 * Utilization (which keeps its own fixed, chart-paired columns above).
 * Column labels/cell formatting mirror services/pdfTable.ts exactly, so the
 * on-screen preview and the PDF/Excel/CSV export always agree.
 */
const REPORT_PAGE_SIZE = 25;

function GenericReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  const headers = Object.keys(rows[0] ?? {});
  // Exports (PDF/Excel/CSV) and the on-screen preview intentionally share
  // the same full, unfiltered `rows` — only how this table *displays* them
  // is paginated, so a large report (Audit Trail especially) isn't one huge
  // scroll-to-see-everything table on screen.
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const pageRows = rows.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE);

  return (
    <>
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3">
                {humanizeHeader(h)}
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
