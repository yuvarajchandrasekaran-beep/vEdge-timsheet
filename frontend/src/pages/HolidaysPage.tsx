import { useEffect, useMemo, useState } from "react";
import { usePageHeader } from "../hooks/usePageHeader";
import {
  useCreateHoliday,
  useCreateHolidayCalendar,
  useDeleteHoliday,
  useDeleteHolidayCalendar,
  useHolidayCalendars,
  useHolidays,
  useSyncFederalHolidays,
  useUpdateHoliday,
  useUpdateHolidayCalendar,
} from "../hooks/useHolidays";
import { Modal } from "../components/common/Modal";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { IconCalendar, IconEdit, IconPlus, IconTrash } from "../components/common/icons";
import type { Holiday, HolidayCalendar } from "../types";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
const DEFAULT_COLOR = "#1B4298";

export default function HolidaysPage() {
  usePageHeader("Holiday Calendars", "Each client has at most one calendar; a client with none shows no holidays to its team");
  const [year, setYear] = useState(currentYear);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [calendarFormOpen, setCalendarFormOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<HolidayCalendar | null>(null);
  const [deleteCalendarTarget, setDeleteCalendarTarget] = useState<HolidayCalendar | null>(null);
  const [holidayFormOpen, setHolidayFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [deleteHolidayTarget, setDeleteHolidayTarget] = useState<Holiday | null>(null);
  const { showToast } = useToast();

  const calendarsQuery = useHolidayCalendars();
  const calendars = calendarsQuery.data ?? [];
  const selectedCalendar = calendars.find((c) => c.id === calendarId) ?? null;

  // Default to the first calendar once the list loads; re-pick if the
  // currently selected one gets deleted out from under this page.
  useEffect(() => {
    if (calendars.length === 0) {
      setCalendarId(null);
    } else if (!calendarId || !calendars.some((c) => c.id === calendarId)) {
      setCalendarId(calendars[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars.map((c) => c.id).join(",")]);

  const holidaysQuery = useHolidays(calendarId ?? undefined, year);
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const syncFederal = useSyncFederalHolidays();
  const createCalendar = useCreateHolidayCalendar();
  const updateCalendar = useUpdateHolidayCalendar();
  const deleteCalendar = useDeleteHolidayCalendar();

  const holidays = useMemo(
    () => [...(holidaysQuery.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [holidaysQuery.data]
  );

  function openCreateHoliday() {
    setEditingHoliday(null);
    setHolidayFormOpen(true);
  }
  function openEditHoliday(h: Holiday) {
    setEditingHoliday(h);
    setHolidayFormOpen(true);
  }

  function handleSync() {
    if (!calendarId) return;
    syncFederal.mutate(
      { year, calendarId },
      {
        onSuccess: (data) => {
          showToast(
            data.createdCount > 0
              ? `Added ${data.createdCount} US federal holiday${data.createdCount === 1 ? "" : "s"} for ${year}.`
              : `US federal holidays for ${year} are already up to date on this calendar.`,
            "success"
          );
        },
        onError: (err) => showToast(getApiErrorMessage(err, "Couldn't sync the federal calendar."), "error"),
      }
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Calendar</label>
          <select
            value={calendarId ?? ""}
            onChange={(e) => setCalendarId(e.target.value || null)}
            className="input w-64"
          >
            {calendars.length === 0 && <option value="">No calendars yet</option>}
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedCalendar && (
            <>
              <button
                onClick={() => {
                  setEditingCalendar(selectedCalendar);
                  setCalendarFormOpen(true);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Edit calendar"
              >
                <IconEdit size={15} />
              </button>
              <button
                onClick={() => setDeleteCalendarTarget(selectedCalendar)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-status-danger"
                aria-label="Delete calendar"
              >
                <IconTrash size={15} />
              </button>
            </>
          )}
          <button
            onClick={() => {
              setEditingCalendar(null);
              setCalendarFormOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <IconPlus size={15} />
            New calendar
          </button>
        </div>
        {selectedCalendar && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedCalendar.color }} />
            <span>
              Assigned to:{" "}
              {selectedCalendar.clientNames?.length ? selectedCalendar.clientNames.join(", ") : "no clients yet"}
            </span>
          </div>
        )}
      </div>

      {calendars.length === 0 && !calendarsQuery.isLoading ? (
        <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-gray-100">
          <EmptyState
            title="No holiday calendars yet"
            description="Create a calendar, then assign it to a client from the Projects page's Clients tab."
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-32">
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncFederal.isPending || !calendarId}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                <IconCalendar size={15} />
                Sync US federal holidays for {year}
              </button>
              <button
                onClick={openCreateHoliday}
                disabled={!calendarId}
                className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
              >
                <IconPlus size={15} />
                Add holiday
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-soft ring-1 ring-gray-100">
            {holidaysQuery.isLoading ? (
              <LoadingBlock />
            ) : holidaysQuery.isError ? (
              <div className="p-4">
                <ErrorState error={holidaysQuery.error} onRetry={() => holidaysQuery.refetch()} />
              </div>
            ) : holidays.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={`No holidays set up for ${year}`}
                  description="Sync the US federal calendar or add one manually."
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3.5 font-medium text-gray-900">{formatDate(h.date, "EEEE, MMM d, yyyy")}</td>
                      <td className="px-4 py-3.5 text-gray-700">{h.name}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditHoliday(h)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="Edit"
                          >
                            <IconEdit size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteHolidayTarget(h)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-status-danger"
                            aria-label="Delete"
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {calendarId && (
        <HolidayFormModal
          open={holidayFormOpen}
          holiday={editingHoliday}
          onClose={() => setHolidayFormOpen(false)}
          onSave={(body) => {
            const onError = (err: unknown) => showToast(getApiErrorMessage(err, "Couldn't save this holiday."), "error");
            if (editingHoliday) {
              updateHoliday.mutate(
                { id: editingHoliday.id, ...body },
                { onSuccess: () => { showToast("Holiday updated.", "success"); setHolidayFormOpen(false); }, onError }
              );
            } else {
              createHoliday.mutate(
                { ...body, calendarId },
                { onSuccess: () => { showToast("Holiday added.", "success"); setHolidayFormOpen(false); }, onError }
              );
            }
          }}
          saving={createHoliday.isPending || updateHoliday.isPending}
        />
      )}

      <Modal
        open={!!deleteHolidayTarget}
        onClose={() => setDeleteHolidayTarget(null)}
        title={`Delete "${deleteHolidayTarget?.name ?? ""}"?`}
        footer={
          <>
            <button onClick={() => setDeleteHolidayTarget(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!deleteHolidayTarget) return;
                deleteHoliday.mutate(deleteHolidayTarget.id, {
                  onSuccess: () => { showToast("Holiday removed.", "success"); setDeleteHolidayTarget(null); },
                  onError: (err) => showToast(getApiErrorMessage(err, "Couldn't remove this holiday."), "error"),
                });
              }}
              disabled={deleteHoliday.isPending}
              className="rounded-lg bg-status-danger px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          This removes it from this calendar — anyone whose project is on this calendar will no longer see a warning
          for this date.
        </p>
      </Modal>

      <CalendarFormModal
        open={calendarFormOpen}
        calendar={editingCalendar}
        onClose={() => setCalendarFormOpen(false)}
        onSave={(body) => {
          const onError = (err: unknown) => showToast(getApiErrorMessage(err, "Couldn't save this calendar."), "error");
          if (editingCalendar) {
            updateCalendar.mutate(
              { id: editingCalendar.id, ...body },
              { onSuccess: () => { showToast("Calendar updated.", "success"); setCalendarFormOpen(false); }, onError }
            );
          } else {
            createCalendar.mutate(body, {
              onSuccess: (created) => {
                showToast("Calendar created.", "success");
                setCalendarFormOpen(false);
                setCalendarId(created.id);
              },
              onError,
            });
          }
        }}
        saving={createCalendar.isPending || updateCalendar.isPending}
      />

      <Modal
        open={!!deleteCalendarTarget}
        onClose={() => setDeleteCalendarTarget(null)}
        title={`Delete "${deleteCalendarTarget?.name ?? ""}"?`}
        footer={
          <>
            <button onClick={() => setDeleteCalendarTarget(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!deleteCalendarTarget) return;
                deleteCalendar.mutate(deleteCalendarTarget.id, {
                  onSuccess: () => { showToast("Calendar deleted.", "success"); setDeleteCalendarTarget(null); },
                  onError: (err) => showToast(getApiErrorMessage(err, "Couldn't delete this calendar."), "error"),
                });
              }}
              disabled={deleteCalendar.isPending}
              className="rounded-lg bg-status-danger px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Blocked while this calendar still has holidays or is assigned to a client — reassign or remove those first.
        </p>
      </Modal>
    </div>
  );
}

function HolidayFormModal({
  open,
  holiday,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  holiday: Holiday | null;
  onClose: () => void;
  onSave: (body: { name: string; date: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(holiday?.name ?? "");
  const [date, setDate] = useState(holiday?.date ?? "");

  // Reset local form state whenever the modal is opened for a different
  // holiday (or a fresh "Add"), since this component stays mounted.
  const openKey = `${open}|${holiday?.id ?? "new"}`;
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setName(holiday?.name ?? "");
    setDate(holiday?.date ?? "");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={holiday ? "Edit holiday" : "Add holiday"}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), date })}
            disabled={!name.trim() || !date || saving}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {holiday ? "Save changes" : "Add holiday"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independence Day" className="input" autoFocus />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
      </div>
    </Modal>
  );
}

function CalendarFormModal({
  open,
  calendar,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  calendar: HolidayCalendar | null;
  onClose: () => void;
  onSave: (body: { name: string; color: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(calendar?.name ?? "");
  const [color, setColor] = useState(calendar?.color ?? DEFAULT_COLOR);

  const openKey = `${open}|${calendar?.id ?? "new"}`;
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setName(calendar?.name ?? "");
    setColor(calendar?.color ?? DEFAULT_COLOR);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={calendar ? "Edit calendar" : "New calendar"}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), color })}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-50"
          >
            {calendar ? "Save changes" : "Create calendar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vodacom Calendar" className="input" autoFocus />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 p-1"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#1B4298"
              className="input flex-1 uppercase"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
