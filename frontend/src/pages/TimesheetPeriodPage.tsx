import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { usePageHeader } from "../hooks/usePageHeader";
import { useCopyPeriod, useMyTimesheetsForPeriod, useSaveTimesheetDraft, useSubmitBatch } from "../hooks/useTimesheets";
import { useProjects } from "../hooks/useProjects";
import { useKeyedDebouncedCallback } from "../hooks/useKeyedDebouncedCallback";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import { getWeekDays, getWeekEnd, getWeekStart } from "../utils/week";
import { formatHoursMinutes, formatWeekRange } from "../utils/format";
import { validateCellHours, validateDayTotal } from "../utils/validation";
import {
  buildRowsFromTimesheets,
  dayTotal,
  emptyRow,
  rowsToEntries,
  weekTotal,
  type GridRow,
} from "../utils/timesheetGrid";
import {
  getCalendarMonthWeekStarts,
  getFortnightWeekStarts,
  periodLabel,
  shiftPeriodAnchor,
  type PeriodKind,
} from "../utils/period";
import { StatusBadge } from "../components/common/Badge";
import { AddProjectRowTypeahead, type TaskOption } from "../components/timesheet/AddProjectRowTypeahead";
import { CommentOverlay } from "../components/timesheet/CommentOverlay";
import { TimesheetViewSwitcher } from "../components/timesheet/TimesheetViewSwitcher";
import { SubmitPeriodModal } from "../components/timesheet/SubmitPeriodModal";
import { CompactViewToggle } from "../components/timesheet/CompactViewToggle";
import { useShowWeekends } from "../hooks/useShowWeekends";
import { LoadingBlock } from "../components/common/Spinner";
import { IconChevronLeft, IconChevronRight, IconCopy, IconTrash } from "../components/common/icons";

const AUTOSAVE_DELAY = 900;
const EDITABLE_STATUSES = ["DRAFT", "RECALLED", "REJECTED"];

// Cycling palettes so adjacent weeks (columns in Fortnight, stacked blocks in
// Monthly) and adjacent projects (rows) are visually distinct at a glance,
// not just separated by whitespace.
const WEEK_PALETTE = [
  { header: "bg-blue-50 border-blue-200", chip: "bg-blue-100 text-blue-800", cell: "bg-blue-50/40", topBorder: "border-t-blue-400" },
  { header: "bg-violet-50 border-violet-200", chip: "bg-violet-100 text-violet-800", cell: "bg-violet-50/40", topBorder: "border-t-violet-400" },
  { header: "bg-teal-50 border-teal-200", chip: "bg-teal-100 text-teal-800", cell: "bg-teal-50/40", topBorder: "border-t-teal-400" },
  { header: "bg-amber-50 border-amber-200", chip: "bg-amber-100 text-amber-800", cell: "bg-amber-50/40", topBorder: "border-t-amber-400" },
  { header: "bg-rose-50 border-rose-200", chip: "bg-rose-100 text-rose-800", cell: "bg-rose-50/40", topBorder: "border-t-rose-400" },
  { header: "bg-cyan-50 border-cyan-200", chip: "bg-cyan-100 text-cyan-800", cell: "bg-cyan-50/40", topBorder: "border-t-cyan-400" },
];
function weekColor(index: number) {
  return WEEK_PALETTE[index % WEEK_PALETTE.length];
}

const PROJECT_PALETTE = [
  "border-l-blue-400 bg-blue-50/50",
  "border-l-emerald-400 bg-emerald-50/50",
  "border-l-amber-400 bg-amber-50/50",
  "border-l-purple-400 bg-purple-50/50",
  "border-l-rose-400 bg-rose-50/50",
  "border-l-cyan-400 bg-cyan-50/50",
];

export default function TimesheetPeriodPage({ kind }: { kind: PeriodKind }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const defaultAnchor = getWeekStart();
  const anchor = searchParams.get("anchor") || defaultAnchor;

  const weekStarts = useMemo(
    () => (kind === "month" ? getCalendarMonthWeekStarts(anchor) : getFortnightWeekStarts(anchor)),
    [kind, anchor]
  );
  const label = periodLabel(kind, anchor, weekStarts);
  usePageHeader(kind === "month" ? "Monthly Timesheet" : "Fortnight Timesheet", label);

  // One row of WeekDay info per date across the WHOLE period — the shared
  // data model spans every date in the period regardless of how it's
  // rendered (Fortnight: one continuous table; Monthly: stacked per-week
  // tables reading from this same data, see the render section below).
  const allDays = useMemo(() => weekStarts.flatMap((ws) => getWeekDays(ws)), [weekStarts]);
  const allDates = useMemo(() => allDays.map((d) => d.date), [allDays]);

  // "Company view" — a display-only filter, applied per-block in
  // PeriodGridBlock below. Totals/warnings/persistence here always use the
  // full allDays/allDates so hiding weekends never changes what counts.
  const [showWeekends, setShowWeekends] = useShowWeekends();

  const projectsQuery = useProjects({ status: "ACTIVE", page: 1, pageSize: 100 });
  const summaryQueries = useMyTimesheetsForPeriod(weekStarts);
  const saveDraft = useSaveTimesheetDraft();
  const copyPeriod = useCopyPeriod();
  const submitBatch = useSubmitBatch();

  const [rows, setRows] = useState<GridRow[]>([]);
  const [globalComment, setGlobalComment] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const hydratedKey = useRef<string | null>(null);
  const hydratedComment = useRef<string | null>(null);
  const lastPushedComment = useRef<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const allLoaded = summaryQueries.every((q) => q.data !== undefined);
  const weekStartsKey = weekStarts.join(",");

  // Hydrate the unified grid once all weeks in the period have loaded — keyed
  // on the period itself so navigating to a different month/fortnight (or a
  // fresh Copy) re-hydrates, but a background refetch of the same period
  // doesn't clobber in-progress edits.
  useEffect(() => {
    if (!allLoaded) return;
    if (hydratedKey.current === weekStartsKey) return;
    hydratedKey.current = weekStartsKey;
    setRows(buildRowsFromTimesheets(summaryQueries.map((q) => q.data), allDates));
    setSaveStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, weekStartsKey]);

  useEffect(() => {
    if (!allLoaded) return;
    if (hydratedComment.current === weekStartsKey) return;
    hydratedComment.current = weekStartsKey;
    const existing = summaryQueries.map((q) => q.data?.weekNotes).find((n) => n?.trim());
    setGlobalComment(existing ?? "");
    lastPushedComment.current = existing ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, weekStartsKey]);

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

  // Keyed on the row IDs (not `rows` itself) so this stays reference-stable
  // while typing hours/notes into existing rows — that only replaces the
  // `rows` array, not the set of project/task IDs in it — which in turn
  // keeps AddProjectRowTypeahead's own filtering memo from re-running on
  // every keystroke elsewhere in the grid.
  const rowIdsKey = rows.map((r) => r.projectTaskId).join(",");
  const existingProjectTaskIds = useMemo(() => new Set(rows.map((r) => r.projectTaskId)), [rowIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable color per project (by first-seen order in the row list), reused
  // everywhere a row is rendered so the same project always reads as the
  // same color, in both the Fortnight table and the Monthly stacked blocks.
  const projectColorByProjectId = useMemo(() => {
    const map = new Map<string, string>();
    let next = 0;
    for (const row of rows) {
      if (!map.has(row.projectId)) {
        map.set(row.projectId, PROJECT_PALETTE[next % PROJECT_PALETTE.length]);
        next++;
      }
    }
    return map;
  }, [rows]);
  function projectColor(projectId: string): string {
    return projectColorByProjectId.get(projectId) ?? PROJECT_PALETTE[0];
  }

  function statusForWeek(weekStart: string): string {
    const idx = weekStarts.indexOf(weekStart);
    return summaryQueries[idx]?.data?.status ?? "DRAFT";
  }
  function isWeekEditable(weekStart: string): boolean {
    return EDITABLE_STATUSES.includes(statusForWeek(weekStart));
  }
  function weekStartOfDate(date: string): string {
    return getWeekStart(new Date(`${date}T00:00:00`));
  }
  function isDateEditable(date: string): boolean {
    return isWeekEditable(weekStartOfDate(date));
  }

  const persist = (weekStart: string, entries: ReturnType<typeof rowsToEntries>, notes: string) => {
    setSaveStatus("saving");
    return saveDraft
      .mutateAsync({ weekStart, entries, weekNotes: notes })
      .then((data) => {
        setSaveStatus("saved");
        return data;
      })
      .catch((err) => {
        setSaveStatus("error");
        throw err;
      });
  };
  const { debounced: debouncedPersist, flushAll } = useKeyedDebouncedCallback(persist, AUTOSAVE_DELAY);

  useEffect(() => {
    return () => void flushAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartsKey]);

  function persistWeekOf(nextRows: GridRow[], date: string) {
    const ws = weekStartOfDate(date);
    const weekDates = getWeekDays(ws).map((d) => d.date);
    const weekEntries = rowsToEntries(nextRows).filter((e) => weekDates.includes(e.entryDate));
    debouncedPersist(ws, weekEntries, globalComment);
  }

  // Push the period-level global comment into every editable week's own
  // weekNotes whenever it changes (skip the first hydration so opening the
  // page doesn't immediately fire a save for every week).
  useEffect(() => {
    if (!allLoaded) return;
    if (lastPushedComment.current === globalComment) return;
    lastPushedComment.current = globalComment;
    for (const ws of weekStarts) {
      if (!isWeekEditable(ws)) continue;
      const weekDates = getWeekDays(ws).map((d) => d.date);
      const weekEntries = rowsToEntries(rows).filter((e) => weekDates.includes(e.entryDate));
      debouncedPersist(ws, weekEntries, globalComment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalComment, allLoaded]);

  function updateCell(projectTaskId: string, date: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.projectTaskId === projectTaskId ? { ...r, hours: { ...r.hours, [date]: value } } : r));
      persistWeekOf(next, date);
      return next;
    });
  }

  function updateNote(projectTaskId: string, date: string, value: string) {
    setRows((prev) => {
      const next = prev.map((r) => (r.projectTaskId === projectTaskId ? { ...r, notes: { ...r.notes, [date]: value } } : r));
      persistWeekOf(next, date);
      return next;
    });
  }

  function addRow(option: TaskOption) {
    setRows((prev) => [...prev, emptyRow(allDates, option)]);
  }

  // A row with hours already locked into an Approved/Submitted week can't be
  // fully removed — there's no way to zero out that week's server record,
  // and removing it from local state only would just reappear on refresh.
  function rowHasLockedHours(row: GridRow): boolean {
    return weekStarts.some((ws) => {
      if (isWeekEditable(ws)) return false;
      return getWeekDays(ws).some((d) => Number(row.hours[d.date]) > 0);
    });
  }

  function removeRow(projectTaskId: string) {
    setRows((prev) => {
      const removed = prev.find((r) => r.projectTaskId === projectTaskId);
      if (removed && rowHasLockedHours(removed)) return prev;
      const next = prev.filter((r) => r.projectTaskId !== projectTaskId);
      if (removed) {
        for (const ws of weekStarts) {
          if (!isWeekEditable(ws)) continue;
          const weekDates = getWeekDays(ws).map((d) => d.date);
          const hadHours = weekDates.some((d) => Number(removed.hours[d]) > 0);
          if (!hadHours) continue;
          const zeroed = weekDates
            .filter((d) => Number(removed.hours[d]) > 0)
            .map((d) => ({ projectTaskId, entryDate: d, hours: 0 }));
          const weekEntries = rowsToEntries(next).filter((e) => weekDates.includes(e.entryDate));
          debouncedPersist(ws, [...weekEntries, ...zeroed], globalComment);
        }
      }
      return next;
    });
  }

  const grandTotal = weekTotal(rows, allDates);

  const weekSummaries = weekStarts.map((ws) => ({
    weekStart: ws,
    weekEnd: getWeekEnd(ws),
    totalHours: weekTotal(rows, getWeekDays(ws).map((d) => d.date)),
  }));

  // Grid is built exactly like the Fortnight view — a continuous table per
  // 2-week chunk. Fortnight is naturally a single chunk; Monthly stacks
  // several (with a trailing single-week chunk if the month spans an odd
  // number of weeks, e.g. 5).
  const weekChunks = useMemo(() => {
    const chunks: string[][] = [];
    for (let i = 0; i < weekStarts.length; i += 2) chunks.push(weekStarts.slice(i, i + 2));
    return chunks;
  }, [weekStartsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const blockingIssues = useMemo(() => {
    const msgs = new Set<string>();
    for (const q of summaryQueries) {
      for (const issue of q.data?.validation ?? []) {
        if (issue.severity === "blocking") msgs.add(issue.message);
      }
    }
    return [...msgs];
  }, [summaryQueries]);
  const warnings = useMemo(() => {
    const msgs = new Set<string>();
    for (const q of summaryQueries) {
      for (const issue of q.data?.validation ?? []) {
        if (issue.severity === "warning") msgs.add(issue.message);
      }
    }
    return [...msgs];
  }, [summaryQueries]);

  function goToPeriod(nextAnchor: string) {
    void flushAll();
    setSearchParams(nextAnchor === defaultAnchor ? {} : { anchor: nextAnchor });
  }

  function handleCopyPeriod() {
    copyPeriod.mutate(
      { weekStarts },
      {
        onSuccess: () => showToast("Copied hours and projects/tasks from the previous period. Comments were left blank.", "success"),
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't copy the previous period."), "error"),
      }
    );
  }

  async function handleConfirmSubmit() {
    try {
      await Promise.all(flushAll());
    } catch (err) {
      showToast(getApiErrorMessage(err, "Couldn't save your latest changes — try again before submitting."), "error");
      return;
    }
    submitBatch.mutate(
      { weekStarts },
      {
        onSuccess: () => {
          setSubmitModalOpen(false);
          showToast("Timesheet submitted for approval.", "success");
          navigate("/dashboard");
        },
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't submit this period."), "error"),
      }
    );
  }

  // scopeKey distinguishes independent keyboard-navigable grids: the single
  // continuous Fortnight table uses one scope ("period"); Monthly's stacked
  // per-week tables each get their own scope (their weekStart) so arrow keys
  // don't try to jump between separate <table> elements.
  function focusCell(scopeKey: string, rowIndex: number, colIndex: number) {
    inputRefs.current.get(`${scopeKey}-${rowIndex}-${colIndex}`)?.focus();
  }
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, scopeKey: string, rowIndex: number, colIndex: number, colCount: number) {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      focusCell(scopeKey, Math.min(rowIndex + 1, rows.length - 1), colIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(scopeKey, Math.max(rowIndex - 1, 0), colIndex);
    } else if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) === e.currentTarget.value.length) {
      focusCell(scopeKey, rowIndex, Math.min(colIndex + 1, colCount - 1));
    } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
      focusCell(scopeKey, rowIndex, Math.max(colIndex - 1, 0));
    }
  }

  function renderCell(scopeKey: string, row: GridRow, rowIndex: number, date: string, colIndex: number, colCount: number, tint?: string) {
    const raw = row.hours[date] ?? "";
    const validation = validateCellHours(raw);
    const note = row.notes[date] ?? "";
    const noteRequired = (Number(raw) || 0) > 8 && !note.trim();
    const editable = isDateEditable(date);
    return (
      <td key={date} className={clsx("px-1 py-1 align-top", tint)}>
        <div className="flex items-center justify-center gap-0.5">
          <input
            ref={(el) => {
              const refKey = `${scopeKey}-${rowIndex}-${colIndex}`;
              if (el) inputRefs.current.set(refKey, el);
              else inputRefs.current.delete(refKey);
            }}
            type="text"
            inputMode="decimal"
            disabled={!editable}
            value={raw}
            title={validation.message}
            onChange={(e) => updateCell(row.projectTaskId, date, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, scopeKey, rowIndex, colIndex, colCount)}
            className={clsx(
              "h-8 w-10 rounded-lg border bg-white text-center text-xs text-gray-900 focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400",
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
            disabled={!editable}
            title={`${row.projectName} / ${row.taskName} — ${date}`}
            onSave={(next) => updateNote(row.projectTaskId, date, next)}
          />
        </div>
      </td>
    );
  }

  if (projectsQuery.isLoading || !allLoaded) return <LoadingBlock label="Loading your timesheet…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimesheetViewSwitcher />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white">
            <button onClick={() => goToPeriod(shiftPeriodAnchor(kind, anchor, -1))} className="p-2 text-gray-500 hover:text-brand-primary" aria-label="Previous period">
              <IconChevronLeft size={16} />
            </button>
            <button
              onClick={() => goToPeriod(defaultAnchor)}
              title={`Jump to this ${kind}`}
              className="whitespace-nowrap border-x border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:text-brand-primary"
            >
              {label}
            </button>
            <button onClick={() => goToPeriod(shiftPeriodAnchor(kind, anchor, 1))} className="p-2 text-gray-500 hover:text-brand-primary" aria-label="Next period">
              <IconChevronRight size={16} />
            </button>
          </div>
          <CompactViewToggle showWeekends={showWeekends} onChange={setShowWeekends} />
          <button
            onClick={handleCopyPeriod}
            disabled={copyPeriod.isPending}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <IconCopy size={15} />
            Copy previous {kind}
          </button>
          <button
            onClick={() => setSubmitModalOpen(true)}
            disabled={grandTotal === 0}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
          >
            Submit {kind}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label={`Total for ${label}`} value={formatHoursMinutes(grandTotal)} />
        {weekSummaries.map((w, i) => (
          <SummaryTile
            key={w.weekStart}
            label={formatWeekRange(w.weekStart, w.weekEnd)}
            dotColor={weekColor(i).chip}
            value={
              <span className="flex items-center gap-2">
                {formatHoursMinutes(w.totalHours)}
                <StatusBadge status={statusForWeek(w.weekStart)} kind="timesheet" />
              </span>
            }
          />
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100 sm:p-5">
        <p className="mb-3 text-xs text-gray-600">
          Hours are decimal (e.g. <span className="font-medium text-gray-700">7.5</span> = 7h 30m), not clock time — 4.30 means 4 hours 18 minutes, not 4:30. Each row is one project/task for the whole {kind}, grouped two weeks at a time.
        </p>

        <div className="mb-4">
          <AddProjectRowTypeahead
            options={taskOptions}
            excludeIds={existingProjectTaskIds}
            onAdd={addRow}
            disabled={!weekStarts.some((ws) => isWeekEditable(ws))}
          />
          <div className="mt-1.5 flex items-center justify-between text-xs text-gray-600">
            <span>Adding a project/task here adds it to every week below.</span>
            <SaveIndicator status={saveStatus} />
          </div>
        </div>

        <div className="space-y-6">
          {weekChunks.map((chunk, chunkIndex) => (
            <PeriodGridBlock
              key={chunk.join(",")}
              weekStartsChunk={chunk}
              weekIndexOffset={chunkIndex * 2}
              kind={kind}
              rows={rows}
              statusForWeek={statusForWeek}
              isWeekEditable={isWeekEditable}
              renderCell={renderCell}
              removeRow={removeRow}
              rowHasLockedHours={rowHasLockedHours}
              projectColor={projectColor}
              showWeekends={showWeekends}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
        <label className="mb-2 block text-sm font-semibold text-gray-900">Comments for this {kind}</label>
        <textarea
          value={globalComment}
          onChange={(e) => setGlobalComment(e.target.value)}
          rows={3}
          placeholder="Add any overall context for your approver about this period's hours…"
          className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
        <p className="mt-2 text-xs text-gray-600">Applies to every week in this {kind} — at least one comment is required before submitting.</p>
      </div>

      <SubmitPeriodModal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        submitting={submitBatch.isPending}
        weeks={weekSummaries}
        warnings={warnings}
        blockingIssues={blockingIssues}
        periodLabel={label}
        onConfirm={handleConfirmSubmit}
      />
    </div>
  );
}

/**
 * One 2-week block, built exactly like the Fortnight view's continuous
 * table — a single row per project/task spanning both weeks' columns.
 * Monthly stacks several of these (a trailing single-week block if the
 * month spans an odd number of weeks); Fortnight itself is just one block.
 * All blocks read from the SAME shared `rows`/`addRow` (owned by the parent
 * page, whose single "add a project/task" control sits above every block),
 * so a project added once shows up as a row in every block automatically.
 */
function PeriodGridBlock({
  weekStartsChunk,
  weekIndexOffset,
  kind,
  rows,
  statusForWeek,
  isWeekEditable,
  renderCell,
  removeRow,
  rowHasLockedHours,
  projectColor,
  showWeekends,
}: {
  weekStartsChunk: string[];
  weekIndexOffset: number;
  kind: PeriodKind;
  rows: GridRow[];
  statusForWeek: (ws: string) => string;
  isWeekEditable: (ws: string) => boolean;
  renderCell: (scopeKey: string, row: GridRow, rowIndex: number, date: string, colIndex: number, colCount: number, tint?: string) => ReactNode;
  removeRow: (projectTaskId: string) => void;
  rowHasLockedHours: (row: GridRow) => boolean;
  projectColor: (projectId: string) => string;
  showWeekends: boolean;
}) {
  function weekStartOfDate(date: string): string {
    return getWeekStart(new Date(`${date}T00:00:00`));
  }
  function weekIndexOfDate(date: string): number {
    return weekIndexOffset + weekStartsChunk.indexOf(weekStartOfDate(date));
  }

  const chunkKey = weekStartsChunk.join(",");
  const allChunkDays = weekStartsChunk.flatMap((ws) => getWeekDays(ws));
  const allChunkDates = allChunkDays.map((d) => d.date);
  const visibleChunkDays = allChunkDays.filter((d) => showWeekends || !d.isWeekend);
  const visibleChunkDates = visibleChunkDays.map((d) => d.date);
  const chunkTotal = weekTotal(rows, allChunkDates);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 p-2">
      <table className="border-separate border-spacing-0" style={{ minWidth: `${180 + visibleChunkDates.length * 60}px`, width: "100%" }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-3 pb-1 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-gray-600" rowSpan={2}>
              Project / Task
            </th>
            {weekStartsChunk.map((ws, i) => (
              <th key={ws} colSpan={visibleChunkDays.filter((d) => weekStartOfDate(d.date) === ws).length} className="px-1 pb-1.5">
                <div className={clsx("flex items-center justify-between gap-2 rounded-lg border px-2 py-1", weekColor(weekIndexOffset + i).header)}>
                  <span className="text-xs font-semibold text-gray-800">{formatWeekRange(ws, getWeekEnd(ws))}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={statusForWeek(ws)} kind="timesheet" />
                    <Link to={`/timesheets/weekly?week=${ws}`} className="text-xs font-medium text-brand-primary hover:underline">
                      Week view
                    </Link>
                  </div>
                </div>
              </th>
            ))}
            <th className="px-2 pb-1 text-center align-bottom text-xs font-semibold uppercase tracking-wide text-gray-600" rowSpan={2}>
              Total
            </th>
            <th className="w-8" rowSpan={2} />
          </tr>
          <tr>
            {visibleChunkDays.map((d) => (
              <th
                key={d.date}
                className={clsx(
                  "px-1 pb-2 pt-1.5 text-center text-xs font-semibold uppercase tracking-wide",
                  weekColor(weekIndexOfDate(d.date)).cell,
                  d.isWeekend ? "text-gray-400" : "text-gray-600"
                )}
              >
                {d.label}
                <div className="text-[11px] font-normal normal-case text-gray-500">{d.dayNumber}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2 + visibleChunkDates.length} className="py-6 text-center text-sm text-gray-600">
                No rows yet — use the field above to add your first project/task for this {kind}.
              </td>
            </tr>
          )}
          {rows.map((row, rowIndex) => (
            <tr key={row.projectTaskId} className="group">
              <td className={clsx("sticky left-0 z-10 whitespace-nowrap border-l-4 py-1.5 pl-2 pr-4 text-sm", projectColor(row.projectId))}>
                <p className="font-medium text-gray-900">{row.projectName}</p>
                <p className="text-xs text-gray-600">{row.taskName}</p>
              </td>
              {visibleChunkDates.map((date, colIndex) =>
                renderCell(chunkKey, row, rowIndex, date, colIndex, visibleChunkDates.length, weekColor(weekIndexOfDate(date)).cell)
              )}
              <td className="px-2 text-center text-sm font-semibold text-gray-900">{weekTotal([row], allChunkDates).toFixed(2)}</td>
              <td className="px-1 text-center">
                {!rowHasLockedHours(row) && weekStartsChunk.some((ws) => isWeekEditable(ws)) && (
                  <button
                    onClick={() => removeRow(row.projectTaskId)}
                    className="rounded-lg p-1.5 text-gray-300 opacity-0 hover:bg-rose-50 hover:text-status-danger group-hover:opacity-100"
                    aria-label="Remove row"
                  >
                    <IconTrash size={13} />
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
              {visibleChunkDates.map((date) => {
                const total = dayTotal(rows, date);
                const v = validateDayTotal(total);
                return (
                  <td key={date} className={clsx("pt-2 text-center text-sm font-semibold", v.level === "warning" ? "text-status-warning" : "text-gray-700")} title={v.message}>
                    {total.toFixed(2)}
                  </td>
                );
              })}
              <td className="pt-2 text-center text-sm font-bold text-brand-primary">{chunkTotal.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SummaryTile({ label, value, dotColor }: { label: string; value: ReactNode; dotColor?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        {dotColor && <span className={clsx("h-2 w-2 rounded-full", dotColor.split(" ")[0])} />}
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-gray-900">{value}</p>
    </div>
  );
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") return <span className="text-brand-primary">Saving…</span>;
  if (status === "error") return <span className="text-status-danger">Autosave failed — will retry on next change</span>;
  if (status === "saved") return <span>Saved</span>;
  return <span>Autosaves as you type</span>;
}
