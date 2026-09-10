import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useMyTimesheet, useSaveTimesheetDraft } from "../hooks/useTimesheets";
import { useProjects } from "../hooks/useProjects";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { getWeekStart } from "../utils/week";
import { usePageHeader } from "../hooks/usePageHeader";
import { DAILY_HOUR_LIMIT, validateCellHours, validateDayTotal } from "../utils/validation";
import { formatHoursMinutes } from "../utils/format";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { AddProjectRowTypeahead, type TaskOption } from "../components/timesheet/AddProjectRowTypeahead";
import { IconArrowLeft, IconCopy, IconTrash } from "../components/common/icons";
import type { TimesheetEntryInput } from "../hooks/useTimesheets";
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

  const timesheetQuery = useMyTimesheet(weekStart);
  const projectsQuery = useProjects({ status: "ACTIVE", page: 1, pageSize: 100 });
  const saveDraft = useSaveTimesheetDraft();

  const [lines, setLines] = useState<DayLine[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
        onSuccess: () => setSaveStatus("saved"),
        onError: () => setSaveStatus("error"),
      }
    );
  }

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, AUTOSAVE_DELAY);
  useEffect(() => () => flushPersist(), [date]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const nextLines: DayLine[] = prevEntries.map((e) => ({
      projectTaskId: e.projectTaskId,
      projectId: e.projectId,
      projectName: e.projectName,
      taskName: e.taskName,
      hours: e.hours ? String(e.hours) : "",
      notes: e.notes ?? "",
    }));
    setLines(nextLines);
    debouncedPersist(nextLines);
  }

  const dayTotalHours = lines.reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
  const dayValidation = validateDayTotal(dayTotalHours);
  const remaining = Math.max(0, DAILY_HOUR_LIMIT - dayTotalHours);

  if (timesheetQuery.isLoading || projectsQuery.isLoading) return <LoadingBlock label="Loading day…" />;
  if (timesheetQuery.isError) return <ErrorState error={timesheetQuery.error} onRetry={() => timesheetQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/timesheets" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-primary">
          <IconArrowLeft size={14} />
          Back to week view
        </Link>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setSearchParams({ date: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
          {isEditable && (
            <button
              onClick={copyFromPreviousDay}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <IconCopy size={15} />
              Copy from previous day
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
                  <p className="mt-1 text-center text-[11px] text-gray-400">hours</p>
                </div>
                <div className="flex-[2]">
                  <textarea
                    disabled={!isEditable}
                    value={line.notes}
                    onChange={(e) => updateLine(line.projectTaskId, { notes: e.target.value })}
                    placeholder="What did you work on?"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:bg-gray-50"
                  />
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
          excludeIds={new Set(lines.map((l) => l.projectTaskId))}
          onAdd={addLine}
        />
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
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
