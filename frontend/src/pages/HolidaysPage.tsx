import { useMemo, useState } from "react";
import { usePageHeader } from "../hooks/usePageHeader";
import { useCreateHoliday, useDeleteHoliday, useHolidays, useSyncFederalHolidays, useUpdateHoliday } from "../hooks/useHolidays";
import { Modal } from "../components/common/Modal";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { useToast } from "../components/common/Toast";
import { getApiErrorMessage } from "../api/client";
import { formatDate } from "../utils/format";
import { IconCalendar, IconEdit, IconPlus, IconTrash } from "../components/common/icons";
import type { Holiday } from "../types";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

export default function HolidaysPage() {
  usePageHeader("Holiday Calendar", "Company holidays, synced by default with the US federal calendar");
  const [year, setYear] = useState(currentYear);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const { showToast } = useToast();

  const holidaysQuery = useHolidays(year);
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const syncFederal = useSyncFederalHolidays();

  const holidays = useMemo(
    () => [...(holidaysQuery.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [holidaysQuery.data]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(h: Holiday) {
    setEditing(h);
    setFormOpen(true);
  }

  function handleSync() {
    syncFederal.mutate(year, {
      onSuccess: (data) => {
        showToast(
          data.createdCount > 0
            ? `Added ${data.createdCount} US federal holiday${data.createdCount === 1 ? "" : "s"} for ${year}.`
            : `US federal holidays for ${year} are already up to date.`,
          "success"
        );
      },
      onError: (err) => showToast(getApiErrorMessage(err, "Couldn't sync the federal calendar."), "error"),
    });
  }

  return (
    <div className="space-y-5">
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
            disabled={syncFederal.isPending}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <IconCalendar size={15} />
            Sync US federal holidays for {year}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark"
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
                        onClick={() => openEdit(h)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Edit"
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(h)}
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

      <HolidayFormModal
        open={formOpen}
        holiday={editing}
        onClose={() => setFormOpen(false)}
        onSave={(body) => {
          const onError = (err: unknown) => showToast(getApiErrorMessage(err, "Couldn't save this holiday."), "error");
          if (editing) {
            updateHoliday.mutate(
              { id: editing.id, ...body },
              { onSuccess: () => { showToast("Holiday updated.", "success"); setFormOpen(false); }, onError }
            );
          } else {
            createHoliday.mutate(body, {
              onSuccess: () => { showToast("Holiday added.", "success"); setFormOpen(false); },
              onError,
            });
          }
        }}
        saving={createHoliday.isPending || updateHoliday.isPending}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!deleteTarget) return;
                deleteHoliday.mutate(deleteTarget.id, {
                  onSuccess: () => { showToast("Holiday removed.", "success"); setDeleteTarget(null); },
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
          This removes it from the company calendar — employees logging time on this date will no longer see a warning.
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
