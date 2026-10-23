import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useMyTimesheet, useSaveTimesheetDraft, useSubmitTimesheet } from "../hooks/useTimesheets";
import { useProjects } from "../hooks/useProjects";
import { useHolidayMap } from "../hooks/useHolidays";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { getWeekDays, getWeekEnd, getWeekStart } from "../utils/week";
import { usePageHeader } from "../hooks/usePageHeader";
import { DAILY_HOUR_LIMIT, validateCellHours, validateDayTotal } from "../utils/validation";
import { formatHoursMinutes, formatWeekRange } from "../utils/format";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { AddProjectRowTypeahead, type TaskOption } from "../components/timesheet/AddProjectRowTypeahead";
import { CommentOverlay } from "../components/timesheet/CommentOverlay";
import { TimesheetViewSwitcher } from "../components/timesheet/TimesheetViewSwitcher";
import { SubmitConfirmModal } from "../components/timesheet/SubmitConfirmModal";
import { IconArrowLeft, IconCheck, IconCopy, IconTrash } from "../components/common/icons";
import type { TimesheetEntryInput } from "../hooks/useTimesheets";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import clsx from "clsx";

interface DayLine {
  projectTaskId: string;
  projectId: string;
  projectName: string;
  taskName: string;
  hours: string;
  notes: string;
}

const AUTOSAVE_DELAY = 900;

export default function TimesheetDayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const date = searchParams.get("date") || todayIso;
  const weekStart = getWeekStart(parseISO(date));
  usePageHeader(format(parseISO(date), "EEEE, MMM d, yyyy"));
  const holidayMap = useHolidayMap(useMemo(() => [date], [date]));
  const dayHolidays = holidayMap.get(date) ?? [];

  const timesheetQuery = useMyTimesheet(weekStart);
  const projectsQuery = useProjects({ status: "ACTIVE", page: 1, pageSize: 100, mine: true });
  const saveDraft = useSaveTimesheetDraft();
  const submitMutation = useSubmitTimesheet();
  const { showToast } = useToast();

  const [lines, setLines] = useState<DayLine[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [openingSubmit, setOpeningSubmit] = useState(false);
  const hydratedKey = useRef<string | null>(null);

  useEffect(() => {
    if (timesheetQuery.isLoading) return;
    const key = `${weekStart}|${date}`;
    if (hydratedKey.current === key) return;
    const dayEntries = (timesheetQuery.data?.entries ?? []).filter((e) => e.entryDate === date);
    setLines(
      dayEntries.map((e) => ({
        projectTaskId: e.projectTaskId,
        projectId: e.projectId,
        projectName: e.projectName,
        taskName: e.taskName,
        hours: e.hours ? String(e.hours) : "",
        notes: e.notes ?? "",
      }))
    );
    hydratedKey.current = key;
  }, [timesheetQuery.data, timesheetQuery.isLoading, date, weekStart]);

  const taskOptions: TaskOption[] = useMemo(() => {
    const opts: TaskOption[] = [];
    for (const project of projectsQuery.data?.data ?? []) {
      for (const task of project.tasks ?? []) {
        if (task.status !== "ACTIVE") continue;
        opts.push({ projectId: project.id, projectTaskId: task.id, projectName: project.name, taskName: task.name });
      }
    }
    return opts;
  }, [projectsQuery.data]);

  // Keyed on the line IDs, not `lines` itself, so this stays stable while
  // typing hours/notes into an existing line (which replaces the `lines`
  // array but not the set of task IDs in it).
  const lineIdsKey = lines.map((l) => l.projectTaskId).join(",");
  const existingProjectTaskIds = useMemo(() => new Set(lines.map((l) => l.projectTaskId)), [lineIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const timesheet = timesheetQuery.data;
  const isEditable = !timesheet || ["DRAFT", "RECALLED", "REJECTED"].includes(timesheet.status);

  function persist(nextLines: DayLine[]) {
    setSaveStatus("saving");
    const entries: TimesheetEntryInput[] = nextLines.map((l) => ({
      projectTaskId: l.projectTaskId,
      entryDate: date,
      hours: Number(l.hours) || 0,
      notes: l.notes || undefined,
    }));
    saveDraft.mutate(
      { weekStart, entries, weekNotes: timesheet?.weekNotes },
      {
        onSuccess: (data) => {
          setSaveStatus("saved");
          // A line can type-check but still get rejected server-side (no
          // note on an over-8h entry, outside a project's window, over an
          // hour cap) — without the toast, it just silently reverted on the
          // next reload with no indication why; without correcting `lines`
          // right now, the grid kept showing the rejected (unsaved) value in
          // the meantime, feeding a wrong total into this day's own warning.
          if (data.rejectedEntries?.length) {
            const rejected = new Set(data.rejectedEntries);
            setLines((prev) =>
              prev.map((l) => {
                if (!rejected.has(`${l.projectTaskId}:${date}`)) return l;
                const authoritative = data.entries.find((e) => e.projectTaskId === l.projectTaskId && e.entryDate === date);
                return { ...l, hours: authoritative ? String(authoritative.hours) : "", notes: authoritative?.notes ?? "" };
              })
            );
          }
          if (data.rejectedEntryMessages?.length) {
            showToast(`Some entries weren't saved: ${data.rejectedEntryMessages.join(" ")}`, "error");
          }
        },
        onError: () => setSaveStatus("error"),
      }
    );
  }

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, AUTOSAVE_DELAY);
  useEffect(() => () => flushPersist(), [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // weekDayTotals/submitWarnings above both already read from the same
  // `timesheet` query object, so they can't disagree with EACH OTHER — but
  // that object itself can still be stale relative to the real DB record
  // (an entry added from another tab/device, or entered directly against the
  // API, that this page's query cache never picked up). Flushing any pending
  // edit here, then refetching and re-hydrating `lines` for today from the
  // result, makes sure what's shown (and what Confirm & Submit below acts
  // on) matches the server's actual current state. See TimesheetWeeklyPage's
  // handleOpenSubmit for the real case this was found from.
  async function handleOpenSubmit() {
    // See TimesheetWeeklyPage's handleOpenSubmit — forces any field the
    // cursor is still in to commit before this reads current state, instead
    // of relying on event ordering between that field and this click.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setOpeningSubmit(true);
    try {
      await flushPersist();
      const fresh = await timesheetQuery.refetch();
      const dayEntries = (fresh.data?.entries ?? []).filter((e) => e.entryDate === date);
      if (fresh.data) {
        setLines(
          dayEntries.map((e) => ({
            projectTaskId: e.projectTaskId,
            projectId: e.projectId,
            projectName: e.projectName,
            taskName: e.taskName,
            hours: e.hours ? String(e.hours) : "",
            notes: e.notes ?? "",
          }))
        );
      }
      setSubmitModalOpen(true);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Couldn't save your latest changes — try again before submitting."), "error");
    } finally {
      setOpeningSubmit(false);
    }
  }

  function updateLine(projectTaskId: string, patch: Partial<DayLine>) {
    setLines((prev) => {
      const next = prev.map((l) => (l.projectTaskId === projectTaskId ? { ...l, ...patch } : l));
      debouncedPersist(next);
      return next;
    });
  }

  function addLine(option: TaskOption) {
    setLines((prev) => {
      const next = [...prev, { ...option, hours: "", notes: "" }];
      debouncedPersist(next);
      return next;
    });
  }

  function removeLine(projectTaskId: string) {
    setLines((prev) => {
      const removed = prev.find((l) => l.projectTaskId === projectTaskId);
      const next = prev.filter((l) => l.projectTaskId !== projectTaskId);
      // Explicitly zero the removed line server-side (see weekly view for why).
      if (removed && Number(removed.hours) > 0) {
        saveDraft.mutate({
          weekStart,
          entries: [{ projectTaskId, entryDate: date, hours: 0 }],
          weekNotes: timesheet?.weekNotes,
        });
      }
      return next;
    });
  }

  function copyFromPreviousDay() {
    // Previous day's entries live in the same week's data unless it's a Monday
    // (previous day is in last week's payload) — for simplicity, and because the
    // API has no single-day fetch, this copies from whatever is already loaded
    // for this week; a cross-week previous-day copy would need a second fetch.
    const prevDate = format(new Date(new Date(`${date}T00:00:00`).getTime() - 86400000), "yyyy-MM-dd");
    const prevEntries = (timesheet?.entries ?? []).filter((e) => e.entryDate === prevDate);
    if (prevEntries.length === 0) return;
    // Copy carries over time and project/task only — comments are always
    // left blank on a copy so they don't get silently duplicated forward.
    const nextLines: DayLine[] = prevEntries.map((e) => ({
      projectTaskId: e.projectTaskId,
      projectId: e.projectId,
      projectName: e.projectName,
      taskName: e.taskName,
      hours: e.hours ? String(e.hours) : "",
      notes: "",
    }));
    setLines(nextLines);
    debouncedPersist(nextLines);
  }

  const dayTotalHours = lines.reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
  const dayValidation = validateDayTotal(dayTotalHours);
  const remaining = Math.max(0, DAILY_HOUR_LIMIT - dayTotalHours);

  // Submitting from here submits the *whole week* this day belongs to (same
  // endpoint as Week View's own Submit), so the confirmation needs that
  // week's real entries, not just today's — timesheet.entries already has
  // them, since useMyTimesheet(weekStart) always fetches the full week.
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekDayTotals = weekDays.map((d) =>
    (timesheet?.entries ?? []).filter((e) => e.entryDate === d.date).reduce((sum, e) => sum + e.hours, 0)
  );
  const weekTotalHours = weekDayTotals.reduce((sum, v) => sum + v, 0);
  const serverIssues = timesheet?.validation ?? [];
  const submitBlockingIssues = [...new Set(serverIssues.filter((i) => i.severity === "blocking").map((i) => i.message))];
  const submitWarnings = useMemo(() => {
    const msgs: string[] = [];
    weekDays.forEach((d, i) => {
      const v = validateDayTotal(weekDayTotals[i]);
      if (v.level === "warning" && v.message) msgs.push(`${d.label}: ${v.message}`);
    });
    for (const issue of serverIssues) {
      if (issue.severity === "warning" && !msgs.includes(issue.message)) msgs.push(issue.message);
    }
    return msgs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays, timesheet]);

  if (timesheetQuery.isLoading || projectsQuery.isLoading) return <LoadingBlock label="Loading day…" />;
  if (timesheetQuery.isError) return <ErrorState error={timesheetQuery.error} onRetry={() => timesheetQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimesheetViewSwitcher />
        <Link
          to={`/timesheets/weekly?week=${weekStart}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-primary"
        >
          <IconArrowLeft size={14} />
          Back to week view
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setSearchParams({ date: e.target.value })}
            className={clsx(
              "rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary",
              dayHolidays.length > 0 ? "border-slate-400 bg-slate-100 text-slate-900 font-medium" : "border-gray-200 text-gray-700 focus:border-brand-primary"
            )}
          />
          {dayHolidays.map((h) => (
            <span
              key={h.id}
              title={h.calendarName}
              style={{ backgroundColor: h.calendarColor }}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
            >
              {h.name}
            </span>
          ))}
          {isEditable && (
            <button
              onClick={copyFromPreviousDay}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <IconCopy size={15} />
              Copy from previous day
            </button>
          )}
          {isEditable && timesheet && (
            <button
              onClick={handleOpenSubmit}
              disabled={submitMutation.isPending || openingSubmit}
              className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-60"
              title="Submits the entire week this day belongs to, same as Week View's Submit"
            >
              <IconCheck size={15} />
              Submit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Logged today" value={formatHoursMinutes(dayTotalHours)} warn={dayValidation.level === "warning"} />
        <SummaryTile label="Daily limit" value={formatHoursMinutes(DAILY_HOUR_LIMIT)} />
        <SummaryTile label="Remaining" value={formatHoursMinutes(remaining)} />
      </div>

      <div className="space-y-3">
        {!isEditable && timesheet && (
          <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
            This week is <strong>{timesheet.status.replace("_", " ").toLowerCase()}</strong> and its entries are locked.
            {timesheet.status === "SUBMITTED"
              ? " Recall it from Week View to make changes."
              : " Ask your approver to reject it (with a comment) to reopen it for edits."}
          </div>
        )}
        <p className="text-xs text-gray-600">
          Hours are decimal (e.g. <span className="font-medium text-gray-700">7.5</span> = 7h 30m), not clock time — 4.30 means 4 hours 18 minutes, not 4:30.
        </p>
        {lines.length === 0 && !projectsQuery.isLoading && (
          <EmptyState title="No hours logged for this day" description="Add a project/task below to get started." />
        )}
        {lines.map((line) => {
          const validation = validateCellHours(line.hours);
          return (
            <div key={line.projectTaskId} className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold text-gray-900">{line.projectName}</p>
                  <p className="text-xs text-gray-500">{line.taskName}</p>
                </div>
                <div className="w-24">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!isEditable}
                      value={line.hours}
                      title={validation.message}
                      onChange={(e) => updateLine(line.projectTaskId, { hours: e.target.value })}
                      placeholder="0.0"
                      className={clsx(
                        "h-10 w-full rounded-lg border bg-white text-center text-sm font-medium focus:outline-none focus:ring-1 disabled:bg-gray-50",
                        validation.level === "error"
                          ? "border-status-danger ring-status-danger/30"
                          : validation.level === "warning"
                            ? "border-status-warning ring-status-warning/20"
                            : "border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
                      )}
                    />
                    <CommentOverlay
                      value={line.notes}
                      required={(Number(line.hours) || 0) > 8 && !line.notes.trim()}
                      disabled={!isEditable}
                      title={`${line.projectName} / ${line.taskName} — ${date}`}
                      onSave={(next) => updateLine(line.projectTaskId, { notes: next })}
                    />
                  </div>
                  <p className="mt-1 text-center text-[11px] text-gray-400">hours</p>
                </div>
                {isEditable && (
                  <button
                    onClick={() => removeLine(line.projectTaskId)}
                    className="self-start rounded-lg p-2 text-gray-300 hover:bg-rose-50 hover:text-status-danger"
                    aria-label="Delete row"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isEditable && (
        <AddProjectRowTypeahead
          options={taskOptions}
          excludeIds={existingProjectTaskIds}
          onAdd={addLine}
        />
      )}

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          Daily total {dayTotalHours.toFixed(2)}h of {DAILY_HOUR_LIMIT}h00m limit
        </span>
        <span>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && <span className="text-status-danger">Autosave failed</span>}
          {saveStatus === "idle" && "Autosaves as you type"}
        </span>
      </div>

      {timesheet && (
        <SubmitConfirmModal
          open={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
          submitting={submitMutation.isPending}
          days={weekDays}
          dayTotals={weekDayTotals}
          weekTotalHours={weekTotalHours}
          warnings={submitWarnings}
          blockingIssues={submitBlockingIssues}
          weekLabel={formatWeekRange(weekStart, getWeekEnd(weekStart))}
          onConfirm={async () => {
            // Mirrors Week View's submit — without this, confirming right
            // after an edit (before its debounce fired) could submit the
            // week as it was BEFORE that last edit.
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
                },
                onError: (err) => showToast(getApiErrorMessage(err, "Couldn't submit this timesheet."), "error"),
              }
            );
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={clsx("mt-1 text-lg font-bold", warn ? "text-status-warning" : "text-gray-900")}>{value}</p>
    </div>
  );
}
