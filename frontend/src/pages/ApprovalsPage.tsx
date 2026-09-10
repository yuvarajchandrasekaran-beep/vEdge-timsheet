import { useMemo, useState } from "react";
import { useApprovalsPending, useApproveTimesheet, useBulkApprove, useRejectTimesheet } from "../hooks/useApprovals";
import { usePageHeader } from "../hooks/usePageHeader";
import type { ApprovalLevel } from "../types";
import { Avatar } from "../components/common/Avatar";
import { Badge } from "../components/common/Badge";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { ROLE_LABELS } from "../types";
import { formatDateTime, formatHoursMinutes, formatWeekRange } from "../utils/format";
import { IconCheck, IconCheckSquare, IconX } from "../components/common/icons";

type Tab = "PENDING" | "APPROVED" | "REJECTED";
const TABS: { key: Tab; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Returned" },
];

const PAGE_SIZE = 10;

export default function ApprovalsPage({ level }: { level: ApprovalLevel }) {
  const [tab, setTab] = useState<Tab>("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<{ timesheetId: string; userName: string } | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const query = useApprovalsPending({ level, status: tab, page, pageSize: PAGE_SIZE });
  const approveMutation = useApproveTimesheet();
  const rejectMutation = useRejectTimesheet();
  const bulkApprove = useBulkApprove();

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

  const title = level === "L1" ? "Approvals — Level 1" : "Approvals — Level 2";
  const subtitle =
    level === "L1" ? "Project Admin review of direct reports' timesheets" : "HR Admin final review of submitted timesheets";
  usePageHeader(title, subtitle);

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
            <button
              onClick={() =>
                bulkApprove.mutate(Array.from(selected), {
                  onSuccess: () => setSelected(new Set()),
                })
              }
              disabled={bulkApprove.isPending}
              className="flex items-center gap-2 rounded-xl bg-status-success px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <IconCheckSquare size={16} />
              Bulk approve ({selected.size})
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
                              onClick={() => approveMutation.mutate({ timesheetId: item.timesheetId })}
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
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={`Return ${rejectTarget?.userName ?? ""}'s timesheet`}
        footer={
          <>
            <button onClick={() => setRejectTarget(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!rejectTarget || !rejectComment.trim()) return;
                rejectMutation.mutate(
                  { timesheetId: rejectTarget.timesheetId, comment: rejectComment.trim() },
                  { onSuccess: () => setRejectTarget(null) }
                );
              }}
              disabled={!rejectComment.trim() || rejectMutation.isPending}
              className="rounded-lg bg-status-danger px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Return with comment
            </button>
          </>
        }
      >
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Reason for returning (required)</label>
        <textarea
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Explain what needs correction before this can be resubmitted…"
          className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </Modal>
    </div>
  );
}
