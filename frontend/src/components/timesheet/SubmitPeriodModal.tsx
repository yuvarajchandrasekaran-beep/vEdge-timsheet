import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { IconAlertTriangle } from "../common/icons";
import { formatHoursMinutes, formatWeekRange } from "../../utils/format";

export function SubmitPeriodModal({
  open,
  onClose,
  onConfirm,
  submitting,
  weeks,
  warnings,
  blockingIssues,
  periodLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  submitting: boolean;
  weeks: { weekStart: string; weekEnd: string; totalHours: number }[];
  warnings: string[];
  blockingIssues: string[];
  periodLabel: string;
}) {
  const canSubmit = blockingIssues.length === 0;
  const grandTotal = weeks.reduce((s, w) => s + w.totalHours, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit timesheet for approval"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || !canSubmit}
            title={canSubmit ? undefined : "Fix the issues above before submitting"}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {submitting && <Spinner size={14} className="text-white" />}
            {canSubmit ? "Confirm & Submit" : "Fix issues to submit"}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">
        You're about to submit every week with logged time in <span className="font-medium text-gray-900">{periodLabel}</span> for approval.
      </p>

      <div className="mt-4 space-y-1.5">
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-600">{formatWeekRange(w.weekStart, w.weekEnd)}</span>
            <span className="font-semibold text-gray-900">{formatHoursMinutes(w.totalHours)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
        <span className="text-sm font-medium text-brand-primary">Total for this period</span>
        <span className="text-lg font-bold text-brand-primary">{formatHoursMinutes(grandTotal)}</span>
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
