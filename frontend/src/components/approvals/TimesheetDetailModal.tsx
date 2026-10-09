import { Modal } from "../common/Modal";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { StatusBadge } from "../common/Badge";
import { useTimesheetDetail } from "../../hooks/useTimesheets";
import { getWeekDays } from "../../utils/week";
import { formatDateTime, formatHoursMinutes, formatWeekRange } from "../../utils/format";

/**
 * Read-only breakdown of a submitted/decided timesheet — lets an approver
 * see the actual day-by-day entries (project, task, hours, notes) behind a
 * queue row before approving or rejecting it "blind," and lets anyone check
 * what an Approved/Returned row actually contained after the fact.
 */
export function TimesheetDetailModal({ timesheetId, onClose }: { timesheetId: string | null; onClose: () => void }) {
  const query = useTimesheetDetail(timesheetId ?? undefined);
  const timesheet = query.data;

  const rows = (() => {
    if (!timesheet) return [];
    const byTask = new Map<string, { projectName: string; taskName: string; hours: Record<string, number>; notes: Record<string, string> }>();
    for (const e of timesheet.entries) {
      let row = byTask.get(e.projectTaskId);
      if (!row) {
        row = { projectName: e.projectName, taskName: e.taskName, hours: {}, notes: {} };
        byTask.set(e.projectTaskId, row);
      }
      row.hours[e.entryDate] = e.hours;
      if (e.notes) row.notes[e.entryDate] = e.notes;
    }
    return [...byTask.values()];
  })();
  const days = timesheet ? getWeekDays(timesheet.weekStart) : [];

  return (
    <Modal open={!!timesheetId} onClose={onClose} title={timesheet ? `${timesheet.userName}'s timesheet` : "Timesheet"} size="lg">
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : timesheet ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-900">{formatWeekRange(timesheet.weekStart, timesheet.weekEnd)}</p>
              <p className="text-xs text-gray-500">{timesheet.timesheetCode}</p>
            </div>
            <StatusBadge status={timesheet.status} kind="timesheet" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Project / Task</th>
                  {days.map((d) => (
                    <th key={d.date} className="px-2 py-2 text-center">
                      {d.label} {d.dayNumber}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 2} className="px-3 py-6 text-center text-gray-400">
                      No entries logged this week.
                    </td>
                  </tr>
                )}
                {rows.map((row, i) => {
                  const rowTotal = Object.values(row.hours).reduce((s, h) => s + h, 0);
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{row.projectName}</p>
                        <p className="text-xs text-gray-500">{row.taskName}</p>
                      </td>
                      {days.map((d) => (
                        <td key={d.date} className="px-2 py-2 text-center text-gray-700" title={row.notes[d.date]}>
                          {row.hours[d.date] ? row.hours[d.date].toFixed(2) : "—"}
                          {row.notes[d.date] && <span className="ml-0.5 text-brand-primary">*</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-semibold text-gray-900">{rowTotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2">Daily total</td>
                    {days.map((d) => {
                      const total = rows.reduce((s, r) => s + (r.hours[d.date] ?? 0), 0);
                      return (
                        <td key={d.date} className="px-2 py-2 text-center">
                          {total ? total.toFixed(2) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">{formatHoursMinutes(timesheet.totalHours)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {rows.some((r) => Object.keys(r.notes).length > 0) && <p className="text-xs text-gray-500">* has a note — hover the cell to read it.</p>}

          {timesheet.weekNotes && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Comments for this week</h3>
              <p className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">{timesheet.weekNotes}</p>
            </div>
          )}

          {!!timesheet.approvals?.length && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Approval history</h3>
              <div className="space-y-1.5">
                {timesheet.approvals.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-sm">
                    <span className="text-gray-700">
                      {a.approverName} — <span className={a.action === "APPROVED" ? "text-status-success" : "text-status-danger"}>{a.action}</span>
                      {a.comment ? `: "${a.comment}"` : ""}
                    </span>
                    <span className="text-xs text-gray-400">{formatDateTime(a.actedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
