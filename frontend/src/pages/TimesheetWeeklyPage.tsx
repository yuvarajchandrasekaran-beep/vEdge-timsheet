import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrentWeekStart } from "../hooks/useCurrentWeek";
import { usePageHeader } from "../hooks/usePageHeader";
import { useCopyPeriod, useMyTimesheet, useRecallTimesheet, useSaveTimesheetDraft, useSubmitTimesheet } from "../hooks/useTimesheets";
import { useProjects } from "../hooks/useProjects";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import { addWeeks, getWeekDays, getWeekEnd } from "../utils/week";
import { formatHoursMinutes, formatWeekRange } from "../utils/format";
import { DAILY_HOUR_LIMIT, WEEKLY_HOUR_LIMIT, validateCellHours, validateDayTotal, validateWeekTotal } from "../utils/validation";
import { buildRowsFromTimesheet, dayTotal, emptyRow, rowTotal, rowsToEntries, weekTotal, type GridRow } from "../utils/timesheetGrid";
import { StatusBadge } from "../components/common/Badge";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { AddProjectRowTypeahead, type TaskOption } from "../components/timesheet/AddProjectRowTypeahead";
import { SubmitConfirmModal } from "../components/timesheet/SubmitConfirmModal";
import { IconChevronLeft, IconChevronRight, IconCopy, IconTrash } from "../components/common/icons";
import { CommentOverlay } from "../components/timesheet/CommentOverlay";
import { TimesheetViewSwitcher } from "../components/timesheet/TimesheetViewSwitcher";
import { CompactViewToggle } from "../components/timesheet/CompactViewToggle";
import { useShowWeekends } from "../hooks/useShowWeekends";
import { useHolidayMap } from "../hooks/useHolidays";
import clsx from "clsx";

const AUTOSAVE_DELAY = 900;

export default function TimesheetWeeklyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultWeek = useCurrentWeekStart();
  const weekStart = searchParams.get("week") || defaultWeek;
  const weekEnd = getWeekEnd(weekStart);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const holidayMap = useHolidayMap(useMemo(() => days.map((d) => d.date), [days]));
  const [showWeekends, setShowWeekends] = useShowWeekends();
  const visibleDays = useMemo(() => (showWeekends ? days : days.filter((d) => !d.isWeekend)), [days, showWeekends]);
  const navigate = useNavigate();
  const { showToast } = useToast();
  usePageHeader("Weekly Timesheet", formatWeekRange(weekStart, weekEnd));

  const timesheetQuery = useMyTimesheet(weekStart);
  const projectsQuery = useProjects({ status: "ACTIVE", page: 1, pageSize: 100 });
  const saveDraft = useSaveTimesheetDraft();
  const submitMutation = useSubmitTimesheet();
  const recallMutation = useRecallTimesheet();
  const copyPeriod = useCopyPeriod();

  const [rows, setRows] = useState<GridRow[]>([]);
  const [weekNotes, setWeekNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const hydratedForWeek = useRef<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const timesheet = timesheetQuery.data;

  // Hydrate local grid state from server data once per week (avoid clobbering active edits).
  useEffect(() => {
    if (timesheetQuery.isLoading) return;
    if (hydratedForWeek.current === weekStart) return;
    setRows(buildRowsFromTimesheet(timesheet, weekStart));
    setWeekNotes(timesheet?.weekNotes ?? "");
    // A stale "error" from a previous save (e.g. a network blip on last
    // week's grid) otherwise survived the week switch and resurfaced on the
    // very next edit here, looking like an immediate autosave failure.
    setSaveStatus("idle");
    hydratedForWeek.current = weekStart;
  }, [timesheet, timesheetQuery.isLoading, weekStart]);

  const taskOptions: TaskOption[] = useMemo(() => {
    const opts: TaskOption[] = [];
    for (const project of projectsQuery.data?.data ?? []) {
      for (const task of project.tasks ?? []) {
        if (task.status !== "ACTIVE") continue;
        opts.push({
          projectId: project.id,
          projectTaskId: task.id,
          projectName: project.name,
          taskName: task.name,
        });
      }
    }
    return opts;
  }, [projectsQuery.data]);

  // Keyed on row IDs, not `rows` itself, so this stays stable while typing
  // hours/notes (which replaces the `rows` array but not its task IDs).
  const rowIdsKey = rows.map((r) => r.projectTaskId).join(",");
  const existingProjectTaskIds = useMemo(() => new Set(rows.map((r) => r.projectTaskId)), [rowIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEditable = !timesheet || ["DRAFT", "RECALLED", "REJECTED"].includes(timesheet.status);

  // PUT /timesheets/me/:weekStart is an upsert keyed by (projectTaskId, entryDate) — entries
  // omitted from the body are assumed left untouched server-side. That means removing a row
  // client-side must still send explicit hours:0 for its previously-saved cells, otherwise the
  // old values would silently survive on the backend even though the row disappears from the UI.
  // Returns the save's promise (mutateAsync, not mutate) so that flushPersist()
  // can be awaited — Submit was firing right after flushPersist() without
  // waiting for the flushed save to actually land, so it could read
  // pre-edit entries (stale "Draft"/previous-week-look data after Copy Last
  // Week + edit, or entries that hadn't actually persisted yet).
  const persist = (entries: ReturnType<typeof rowsToEntries>, nextNotes: string) => {
    setSaveStatus("saving");
    return saveDraft
      .mutateAsync({ weekStart, entries, weekNotes: nextNotes })
      .then((data) => {
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        return data;
      })
      .catch((err) => {
        setSaveStatus("error");
        throw err;
      });
  };

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, AUTOSAVE_DELAY);

  useEffect(() => {
    // flush any pending autosave when leaving the week
    return () => {
      flushPersist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  function updateCell(projectTaskId: string, date: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.projectTaskId === projectTaskId ? { ...r, hours: { ...r.hours, [date]: value } } : r));
      debouncedPersist(rowsToEntries(next), weekNotes);
      return next;
    });
  }

  function updateNote(projectTaskId: string, date: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.projectTaskId === projectTaskId ? { ...r, notes: { ...r.notes, [date]: value } } : r));
      debouncedPersist(rowsToEntries(next), weekNotes);
      return next;
    });
  }

  function addRow(option: TaskOption) {
    setRows((prev) => {
      const next = [
        ...prev,
        emptyRow(days.map((d) => d.date), option),
      ];
      debouncedPersist(rowsToEntries(next), weekNotes);
      return next;
    });
  }

  function removeRow(projectTaskId: string) {
    setRows((prev) => {
      const removed = prev.find((r) => r.projectTaskId === projectTaskId);
      const next = prev.filter((r) => r.projectTaskId !== projectTaskId);
      const zeroedEntries = removed
        ? Object.entries(removed.hours)
            .filter(([, raw]) => Number(raw) > 0)
            .map(([date]) => ({ projectTaskId, entryDate: date, hours: 0 }))
        : [];
      debouncedPersist([...rowsToEntries(next), ...zeroedEntries], weekNotes);
      return next;
    });
  }

  function handleNotesChange(value: string) {
    setWeekNotes(value);
    debouncedPersist(rowsToEntries(rows), value);
  }

  function goToWeek(newWeek: string) {
    flushPersist();
    setSearchParams(newWeek === defaultWeek ? {} : { week: newWeek });
  }

  function handleCopyLastWeek() {
    copyPeriod.mutate(
      { weekStarts: [weekStart] },
      {
        onSuccess: (data) => {
          const updated = data.find((t) => t.weekStart === weekStart);
          if (!updated) {
            showToast("No prior week to copy from.", "error");
            return;
          }
          hydratedForWeek.current = null; // force re-hydrate from the new server response
          setRows(buildRowsFromTimesheet(updated, weekStart));
          setWeekNotes(updated.weekNotes ?? "");
          hydratedForWeek.current = weekStart;
          setLastSavedAt(new Date());
          setSaveStatus("saved");
        },
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't copy last week."), "error"),
      }
    );
  }

  function handleRecall() {
    if (!timesheet) return;
    recallMutation.mutate(
      { id: timesheet.id, weekStart },
      {
        onSuccess: () => showToast("Timesheet recalled — you can edit it again.", "success"),
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't recall this timesheet."), "error"),
      }
    );
  }

  // ---- derived validation state ----
  // Totals/warnings always cover the full week — hiding weekend columns is
  // purely a display preference (Company view) and must not change what
  // counts toward the week's real total or its hour-threshold warnings.
  const dateStrings = days.map((d) => d.date);
  const visibleDateStrings = visibleDays.map((d) => d.date);
  const dayTotals = dateStrings.map((d) => dayTotal(rows, d));
  const totalHours = weekTotal(rows, dateStrings);
  const weekValidation = validateWeekTotal(totalHours);
  // Server-computed issues (weekly >50h/>70h, holiday entries, mandatory
  // comment) — see backend/src/services/timesheetValidation.ts. Messages are
  // deduped since the backend emits one issue per affected entry.
  const serverIssues = timesheet?.validation ?? [];
  const blockingIssues = useMemo(
    () => [...new Set(serverIssues.filter((i) => i.severity === "blocking").map((i) => i.message))],
    [serverIssues]
  );
  const warnings = useMemo(() => {
    const msgs: string[] = [];
    dateStrings.forEach((d, i) => {
      const v = validateDayTotal(dayTotals[i]);
      if (v.level === "warning" && v.message) msgs.push(`${days[i].label}: ${v.message}`);
    });
    if (weekValidation.level === "warning" && weekValidation.message) msgs.push(weekValidation.message);
    for (const issue of serverIssues) {
      if (issue.severity === "warning" && !msgs.includes(issue.message)) msgs.push(issue.message);
    }
    return msgs;
  }, [dateStrings, dayTotals, days, weekValidation, serverIssues]);

  function focusCell(rowIndex: number, colIndex: number) {
    const key = `${rowIndex}-${colIndex}`;
    inputRefs.current.get(key)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      focusCell(Math.min(rowIndex + 1, rows.length - 1), colIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(rowIndex - 1, 0), colIndex);
    } else if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) === e.currentTarget.value.length) {
      focusCell(rowIndex, Math.min(colIndex + 1, visibleDateStrings.length - 1));
    } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
      focusCell(rowIndex, Math.max(colIndex - 1, 0));
    }
  }

  if (timesheetQuery.isLoading || projectsQuery.isLoading) return <LoadingBlock label="Loading your timesheet…" />;
  if (timesheetQuery.isError) return <ErrorState error={timesheetQuery.error} onRetry={() => timesheetQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimesheetViewSwitcher />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white">
            <button onClick={() => goToWeek(addWeeks(weekStart, -1))} className="p-2 text-gray-500 hover:text-brand-primary" aria-label="Previous week">
              <IconChevronLeft size={16} />
            </button>
            <button onClick={() => goToWeek(defaultWeek)} className="border-x border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:text-brand-primary">
              This week
            </button>
            <button onClick={() => goToWeek(addWeeks(weekStart, 1))} className="p-2 text-gray-500 hover:text-brand-primary" aria-label="Next week">
              <IconChevronRight size={16} />
            </button>
          </div>
          <CompactViewToggle showWeekends={showWeekends} onChange={setShowWeekends} />
          {isEditable && (
            <button
              onClick={handleCopyLastWeek}
              disabled={copyPeriod.isPending}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <IconCopy size={15} />
              Copy Last Week
            </button>
          )}
          {timesheet?.status === "SUBMITTED" && (
            <button
              onClick={handleRecall}
              disabled={recallMutation.isPending}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
            >
              Recall
            </button>
          )}
          {isEditable && (
            <button
              onClick={() => setSubmitModalOpen(true)}
              disabled={totalHours === 0 || !timesheet}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
            >
              Submit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Total Logged" value={formatHoursMinutes(totalHours)} />
        <SummaryTile label="Remaining" value={formatHoursMinutes(Math.max(0, WEEKLY_HOUR_LIMIT - totalHours))} />
        <SummaryTile label="Status" value={timesheet ? <StatusBadge status={timesheet.status} kind="timesheet" /> : <StatusBadge status="DRAFT" kind="timesheet" />} />
        <SummaryTile label="Timesheet ID" value={timesheet?.timesheetCode ?? "—"} />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100 sm:p-5">
        <p className="mb-2 text-xs text-gray-600">
          Hours are decimal (e.g. <span className="font-medium text-gray-700">7.5</span> = 7h 30m), not clock time — 4.30 means 4 hours 18 minutes, not 4:30.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 pb-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Project / Task
                </th>
                {visibleDays.map((d) => {
                  const holidayName = holidayMap.get(d.date);
                  return (
                    <th
                      key={d.date}
                      title={holidayName ? `${holidayName} (company holiday)` : undefined}
                      className={clsx(
                        "px-2 pb-3 text-center text-xs font-semibold uppercase tracking-wide",
                        holidayName ? "rounded-t-lg bg-purple-50 text-purple-700" : d.isWeekend ? "text-gray-400" : "text-gray-600"
                      )}
                    >
                      {d.label}
                      <div className={clsx("text-[11px] font-normal normal-case", holidayName ? "text-purple-500" : "text-gray-500")}>{d.dayNumber}</div>
                    </th>
                  );
                })}
                <th className="px-3 pb-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleDateStrings.length + 3} className="py-8 text-center text-sm text-gray-600">
                    No rows yet — use the field below to add your first project/task for this week.
                  </td>
                </tr>
              )}
              {rows.map((row, rowIndex) => (
                <tr key={row.projectTaskId} className="group">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-2 pr-4 text-sm">
                    <p className="font-medium text-gray-900">{row.projectName}</p>
                    <p className="text-xs text-gray-500">{row.taskName}</p>
                  </td>
                  {visibleDateStrings.map((date, colIndex) => {
                    const raw = row.hours[date] ?? "";
                    const validation = validateCellHours(raw);
                    const note = row.notes[date] ?? "";
                    const noteRequired = (Number(raw) || 0) > 8 && !note.trim();
                    return (
                      <td key={date} className="px-1.5 py-1.5 align-top">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            ref={(el) => {
                              const refKey = `${rowIndex}-${colIndex}`;
                              if (el) inputRefs.current.set(refKey, el);
                              else inputRefs.current.delete(refKey);
                            }}
                            type="text"
                            inputMode="decimal"
                            disabled={!isEditable}
                            value={raw}
                            title={validation.message}
                            onChange={(e) => updateCell(row.projectTaskId, date, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                            className={clsx(
                              "h-9 w-14 rounded-lg border bg-white text-center text-sm text-gray-800 focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400",
                              validation.level === "error"
                                ? "border-status-danger ring-status-danger/30 focus:ring-status-danger"
                                : validation.level === "warning"
                                  ? "border-status-warning ring-status-warning/20 focus:ring-status-warning"
                                  : "border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
                            )}
                            placeholder="0"
                          />
                          <CommentOverlay
                            value={note}
                            required={noteRequired}
                            disabled={!isEditable}
                            title={`${row.projectName} / ${row.taskName} — ${date}`}
                            onSave={(next) => updateNote(row.projectTaskId, date, next)}
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 text-center text-sm font-semibold text-gray-900">{rowTotal(row).toFixed(2)}</td>
                  <td className="px-1 text-center">
                    {isEditable && (
                      <button
                        onClick={() => removeRow(row.projectTaskId)}
                        className="rounded-lg p-1.5 text-gray-300 opacity-0 hover:bg-rose-50 hover:text-status-danger group-hover:opacity-100"
                        aria-label="Remove row"
                      >
                        <IconTrash size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-white pt-2 text-sm font-semibold text-gray-700">Daily total</td>
                  {visibleDateStrings.map((date) => {
                    const total = dayTotal(rows, date);
                    const v = validateDayTotal(total);
                    return (
                      <td
                        key={date}
                        className={clsx(
                          "pt-2 text-center text-sm font-semibold",
                          v.level === "warning" ? "text-status-warning" : "text-gray-700"
                        )}
                        title={v.message}
                      >
                        {total.toFixed(2)}
                      </td>
                    );
                  })}
                  <td className="pt-2 text-center text-sm font-bold text-brand-primary">{totalHours.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {isEditable && (
          <div className="mt-4">
            <AddProjectRowTypeahead
              options={taskOptions}
              excludeIds={existingProjectTaskIds}
              onAdd={addRow}
            />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span>Daily limit: {DAILY_HOUR_LIMIT}h00m per day</span>
          <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
        <label className="mb-2 block text-sm font-semibold text-gray-900">Week notes</label>
        <textarea
          disabled={!isEditable}
          value={weekNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          rows={3}
          placeholder="Add any context for your approver about this week's hours…"
          className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:bg-gray-50"
        />
      </div>

      <SubmitConfirmModal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        submitting={submitMutation.isPending}
        days={days}
        dayTotals={dayTotals}
        weekTotalHours={totalHours}
        warnings={warnings}
        blockingIssues={blockingIssues}
        weekLabel={formatWeekRange(weekStart, weekEnd)}
        onConfirm={async () => {
          if (!timesheet) return;
          // Wait for any in-flight/pending autosave to actually land before
          // submitting — otherwise Submit could read entries from before
          // the last edit (e.g. right after Copy Last Week + a delete),
          // and a genuine autosave failure here was previously invisible.
          try {
            await flushPersist();
          } catch (err) {
            showToast(getApiErrorMessage(err, "Couldn't save your latest changes — try again before submitting."), "error");
            return;
          }
          submitMutation.mutate(
            { id: timesheet.id, weekStart },
            {
              onSuccess: () => {
                setSubmitModalOpen(false);
                showToast("Timesheet submitted for approval.", "success");
                navigate("/dashboard");
              },
              onError: (err) => {
                showToast(getApiErrorMessage(err, "Couldn't submit this timesheet."), "error");
              },
            }
          );
        }}
      />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

function SaveIndicator({ status, lastSavedAt }: { status: "idle" | "saving" | "saved" | "error"; lastSavedAt: Date | null }) {
  if (status === "saving") return <span className="text-brand-primary">Saving…</span>;
  if (status === "error") return <span className="text-status-danger">Autosave failed — will retry on next change</span>;
  if (status === "saved" && lastSavedAt)
    return <span>Saved at {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
  return <span>Autosaves as you type</span>;
}
