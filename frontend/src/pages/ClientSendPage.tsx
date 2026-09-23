import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useProject } from "../hooks/useProjects";
import { useClientSendPreview, useSendClientTimesheet, downloadClientSendFile } from "../hooks/useClientSend";
import { usePageHeader } from "../hooks/usePageHeader";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { formatDate, formatHoursDecimal } from "../utils/format";
import { IconArrowLeft, IconDownload } from "../components/common/icons";

const todayIso = () => format(new Date(), "yyyy-MM-dd");

export default function ClientSendPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const projectQuery = useProject(id);
  usePageHeader("Send timesheet to client", projectQuery.data?.name);

  const [periodStart, setPeriodStart] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sentResult, setSentResult] = useState<{ fileName: string; downloadId: string } | null>(null);

  const previewQuery = useClientSendPreview(id, periodStart, periodEnd);
  const sendMutation = useSendClientTimesheet();

  // Default every entry to selected whenever a new preview loads (new period,
  // or first load) — "all selected by default" per spec, with the option to
  // deselect a few before sending.
  useEffect(() => {
    if (previewQuery.data) setSelected(new Set(previewQuery.data.entries.map((e) => e.entryId)));
  }, [previewQuery.data]);

  useEffect(() => {
    if (previewQuery.data?.defaultRecipientEmail && !recipientEmail) {
      setRecipientEmail(previewQuery.data.defaultRecipientEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewQuery.data?.defaultRecipientEmail]);

  const entries = previewQuery.data?.entries ?? [];
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.entryId));
  const selectedTotalHours = useMemo(
    () => entries.filter((e) => selected.has(e.entryId)).reduce((s, e) => s + e.hours, 0),
    [entries, selected]
  );

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.entryId)));
  }
  function toggleOne(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function handleSend() {
    if (!id || selected.size === 0 || !recipientEmail.trim()) return;
    sendMutation.mutate(
      { projectId: id, recipientEmail: recipientEmail.trim(), periodStart, periodEnd, entryIds: [...selected] },
      {
        onSuccess: (data) => {
          showToast(`Sent ${data.entryCount} entries to ${data.recipientEmail}.`, "success");
          setSentResult({ fileName: data.fileName, downloadId: data.id });
        },
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't send this timesheet."), "error"),
      }
    );
  }

  if (projectQuery.isLoading) return <LoadingBlock label="Loading project…" />;
  if (projectQuery.isError) return <ErrorState error={projectQuery.error} onRetry={() => projectQuery.refetch()} />;
  if (!projectQuery.data) return null;

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-primary"
      >
        <IconArrowLeft size={14} />
        Back to project
      </button>

      {!projectQuery.data.sendTimesheetToClient ? (
        <EmptyState
          title="Client sending isn't enabled"
          description="Turn on “Send timesheets to the client” from the project's Overview tab first."
        />
      ) : sentResult ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-soft ring-1 ring-gray-100">
          <p className="text-sm font-semibold text-gray-900">Sent to {recipientEmail}</p>
          <p className="mt-1 text-sm text-gray-500">{sentResult.fileName}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => downloadClientSendFile(sentResult.downloadId, sentResult.fileName)}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <IconDownload size={15} />
              Download the file
            </button>
            <Link to={`/projects`} className="rounded-xl bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark">
              Done
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Period start</span>
                <input type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className="input" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Period end</span>
                <input type="date" value={periodEnd} min={periodStart} max={todayIso()} onChange={(e) => setPeriodEnd(e.target.value)} className="input" />
              </label>
              <label className="min-w-[260px] flex-1 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Client email</span>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="billing@client.com"
                  className="input"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
            {previewQuery.isLoading ? (
              <LoadingBlock />
            ) : previewQuery.isError ? (
              <div className="p-4">
                <ErrorState error={previewQuery.error} onRetry={() => previewQuery.refetch()} />
              </div>
            ) : entries.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No time logged in this period" description="Try a different date range." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
                      </th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Task</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.entryId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(e.entryId)}
                            onChange={() => toggleOne(e.entryId)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{e.userName}</td>
                        <td className="px-4 py-3 text-gray-600">{e.taskName}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(e.entryDate)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{formatHoursDecimal(e.hours)}</td>
                        <td className="max-w-[240px] truncate px-4 py-3 text-gray-500" title={e.notes ?? ""}>
                          {e.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{selected.size}</span> of {entries.length} entries selected ·{" "}
                <span className="font-semibold text-gray-900">{formatHoursDecimal(selectedTotalHours)}</span> total
              </p>
              <button
                onClick={handleSend}
                disabled={selected.size === 0 || !recipientEmail.trim() || sendMutation.isPending}
                className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
              >
                Send to client
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
