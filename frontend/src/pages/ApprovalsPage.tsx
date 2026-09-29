import { useState } from "react";
import { useApprovalsPending, useApproveTimesheet, useBulkApprove, useBulkReject, useRejectTimesheet } from "../hooks/useApprovals";
import { useDepartments } from "../hooks/useDepartments";
import { usePageHeader } from "../hooks/usePageHeader";
import { Avatar } from "../components/common/Avatar";
import { Badge } from "../components/common/Badge";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { ROLE_LABELS } from "../types";
import { formatDateTime, formatHoursMinutes, formatWeekRange } from "../utils/format";
import { IconCheck, IconCheckSquare, IconSearch, IconX } from "../components/common/icons";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";

type Tab = "PENDING" | "APPROVED" | "REJECTED";
const TABS: { key: Tab; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Returned" },
];

const PAGE_SIZE = 10;

export default function ApprovalsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [minPendingDays, setMinPendingDays] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<{ timesheetId: string; userName: string } | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  // The reject modal below doubles as the bulk-reject modal — this is the
  // only thing that distinguishes which mode it's in (rejectTarget stays
  // null for a bulk reject, since there's no single timesheet/user to name).
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

  const { data: departments } = useDepartments();
  const query = useApprovalsPending({
    status: tab,
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    department: department || undefined,
    pendingDays: minPendingDays ? Number(minPendingDays) : undefined,
  });
  const approveMutation = useApproveTimesheet();
  const rejectMutation = useRejectTimesheet();
  const bulkApprove = useBulkApprove();
  const bulkReject = useBulkReject();

  function resetFilters() {
    setSearch("");
    setDepartment("");
    setMinPendingDays("");
    setPage(1);
  }

  const items = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.timesheetId));

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(items.map((i) => i.timesheetId));
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeTab(next: Tab) {
    setTab(next);
    setPage(1);
    setSelected(new Set());
  }

  usePageHeader("Approvals", "Project Admin review of your projects' submitted timesheets");

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex-1 rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => changeTab(t.key)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "PENDING" && selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  bulkApprove.mutate(Array.from(selected), {
                    onSuccess: (data: { results: { ok: boolean }[] }) => {
                      const okCount = data.results.filter((r) => r.ok).length;
                      showToast(
                        okCount === data.results.length
                          ? `Approved ${okCount} timesheet${okCount === 1 ? "" : "s"}.`
                          : `Approved ${okCount} of ${data.results.length} — some failed, see the list.`,
                        okCount === data.results.length ? "success" : "error"
                      );
                      setSelected(new Set());
                    },
                    onError: (err) => showToast(getApiErrorMessage(err, "Bulk approve failed."), "error"),
                  })
                }
                disabled={bulkApprove.isPending}
                className="flex items-center gap-2 rounded-xl bg-status-success px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <IconCheckSquare size={16} />
                Bulk approve ({selected.size})
              </button>
              <button
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkReject.isPending}
                className="flex items-center gap-2 rounded-xl border border-status-danger px-4 py-2 text-sm font-semibold text-status-danger hover:bg-rose-50 disabled:opacity-60"
              >
                <IconX size={16} />
                Bulk reject ({selected.size})
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by employee name…"
              className="input pl-9"
            />
          </div>
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
            className="input sm:w-48"
          >
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={minPendingDays}
            onChange={(e) => {
              setMinPendingDays(e.target.value);
              setPage(1);
            }}
            className="input sm:w-48"
          >
            <option value="">Any wait time</option>
            <option value="1">Pending 1+ day</option>
            <option value="3">Pending 3+ days</option>
            <option value="7">Pending 7+ days</option>
          </select>
          {(search || department || minPendingDays) && (
            <button onClick={resetFilters} className="text-sm font-medium text-brand-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>

        {query.isLoading ? (
          <LoadingBlock />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nothing here" description={`No ${tab.toLowerCase()} timesheets for this queue.`} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {tab === "PENDING" && (
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
                      </th>
                    )}
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Week</th>
                    <th className="px-4 py-3">Total hours</th>
                    <th className="px-4 py-3">Submitted on</th>
                    <th className="px-4 py-3">SLA</th>
                    {tab === "PENDING" && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.timesheetId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      {tab === "PENDING" && (
                        <td className="px-4 py-5">
                          <input
                            type="checkbox"
                            checked={selected.has(item.timesheetId)}
                            onChange={() => toggleOne(item.timesheetId)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="px-4 py-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={item.userName} size="md" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.userName}</p>
                            <p className="text-xs text-gray-500">
                              {ROLE_LABELS[item.userRole]} · {item.department}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-sm text-gray-600">{formatWeekRange(item.weekStart, item.weekEnd)}</td>
                      <td className="px-4 py-5 text-sm font-semibold text-gray-900">{formatHoursMinutes(item.totalHours)}</td>
                      <td className="px-4 py-5 text-sm text-gray-600">{formatDateTime(item.submittedAt)}</td>
                      <td className="px-4 py-5">
                        <Badge tone={item.pendingDays > 3 ? "danger" : item.pendingDays > 1 ? "warning" : "success"}>
                          {item.pendingDays} {item.pendingDays === 1 ? "day" : "days"}
                        </Badge>
                      </td>
                      {tab === "PENDING" && (
                        <td className="px-4 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                approveMutation.mutate(
                                  { timesheetId: item.timesheetId },
                                  {
                                    onSuccess: () => showToast(`Approved ${item.userName}'s timesheet.`, "success"),
                                    onError: (err) => showToast(getApiErrorMessage(err, "Couldn't approve this timesheet."), "error"),
                                  }
                                )
                              }
                              disabled={approveMutation.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-status-success hover:bg-emerald-100"
                              aria-label="Approve"
                              title="Approve"
                            >
                              <IconCheck size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setRejectTarget({ timesheetId: item.timesheetId, userName: item.userName });
                                setRejectComment("");
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-status-danger hover:bg-rose-100"
                              aria-label="Reject"
                              title="Reject"
                            >
                              <IconX size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal
        open={!!rejectTarget || bulkRejectOpen}
        onClose={() => {
          setRejectTarget(null);
          setBulkRejectOpen(false);
        }}
        title={bulkRejectOpen ? `Return ${selected.size} timesheet${selected.size === 1 ? "" : "s"}` : `Return ${rejectTarget?.userName ?? ""}'s timesheet`}
        footer={
          <>
            <button
              onClick={() => {
                setRejectTarget(null);
                setBulkRejectOpen(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!rejectComment.trim()) return;
                if (bulkRejectOpen) {
                  bulkReject.mutate(
                    { timesheetIds: Array.from(selected), comment: rejectComment.trim() },
                    {
                      onSuccess: (data: { results: { ok: boolean }[] }) => {
                        const okCount = data.results.filter((r) => r.ok).length;
                        showToast(
                          okCount === data.results.length
                            ? `Returned ${okCount} timesheet${okCount === 1 ? "" : "s"} for correction.`
                            : `Returned ${okCount} of ${data.results.length} — some failed, see the list.`,
                          okCount === data.results.length ? "success" : "error"
                        );
                        setSelected(new Set());
                        setBulkRejectOpen(false);
                        setRejectComment("");
                      },
                      onError: (err) => showToast(getApiErrorMessage(err, "Bulk reject failed."), "error"),
                    }
                  );
                  return;
                }
                if (!rejectTarget) return;
                rejectMutation.mutate(
                  { timesheetId: rejectTarget.timesheetId, comment: rejectComment.trim() },
                  {
                    onSuccess: () => {
                      showToast(`Returned ${rejectTarget.userName}'s timesheet for correction.`, "success");
                      setRejectTarget(null);
                      setRejectComment("");
                    },
                    onError: (err) => showToast(getApiErrorMessage(err, "Couldn't return this timesheet."), "error"),
                  }
                );
              }}
              disabled={!rejectComment.trim() || rejectMutation.isPending || bulkReject.isPending}
              className="rounded-lg bg-status-danger px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Return with comment
            </button>
          </>
        }
      >
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {bulkRejectOpen ? "Reason for returning all selected (required, applied to each)" : "Reason for returning (required)"}
        </label>
        <textarea
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Explain what needs correction before this can be resubmitted…"
          className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
        {rejectMutation.isError && (
          <p className="mt-2 text-sm text-status-danger">{getApiErrorMessage(rejectMutation.error, "Couldn't return this timesheet.")}</p>
        )}
      </Modal>
    </div>
  );
}
