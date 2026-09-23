import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { IconAlertTriangle } from "../common/icons";
import { formatHoursMinutes } from "../../utils/format";
import type { WeekDay } from "../../utils/week";

export function SubmitConfirmModal({
  open,
  onClose,
  onConfirm,
  submitting,
  days,
  dayTotals,
  weekTotalHours,
  warnings,
  blockingIssues = [],
  weekLabel,
  confirmLabel = "Confirm & Submit",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  submitting: boolean;
  days: WeekDay[];
  dayTotals: number[];
  weekTotalHours: number;
  warnings: string[];
  blockingIssues?: string[];
  weekLabel: string;
  confirmLabel?: string;
}) {
  const canSubmit = blockingIssues.length === 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit timesheet for approval"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || !canSubmit}
            title={canSubmit ? undefined : "Fix the issues above before submitting"}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {submitting && <Spinner size={14} className="text-white" />}
            {canSubmit ? confirmLabel : "Fix issues to submit"}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">
        You're about to submit your timesheet for <span className="font-medium text-gray-900">{weekLabel}</span> for
        approval. Review the summary below before confirming.
      </p>

      <div className="mt-4 grid grid-cols-7 gap-1.5 rounded-xl bg-gray-50 p-3 text-center">
        {days.map((d, i) => (
          <div key={d.date}>
            <p className="text-[11px] font-medium text-gray-500">{d.label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{dayTotals[i].toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
        <span className="text-sm font-medium text-brand-primary">Total for the week</span>
        <span className="text-lg font-bold text-brand-primary">{formatHoursMinutes(weekTotalHours)}</span>
      </div>

      {blockingIssues.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-status-danger">
            <IconAlertTriangle size={16} />
            Fix these before you can submit
          </p>
          <ul className="ml-6 list-disc space-y-1 text-sm text-rose-700">
            {blockingIssues.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <IconAlertTriangle size={16} />
            Please note before submitting
          </p>
          <ul className="ml-6 list-disc space-y-1 text-sm text-amber-700">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
