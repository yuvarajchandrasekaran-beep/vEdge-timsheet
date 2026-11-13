import { useState } from "react";
import clsx from "clsx";
import type { GridRow } from "../../utils/timesheetGrid";
import { IconColumns } from "../common/icons";

/**
 * Optional descriptive columns that sit between Project / Task and the day
 * columns. Display-only — they never affect hours, totals or what gets saved.
 */
export interface OptionalColumn {
  key: string;
  label: string;
  value: (row: GridRow) => string | undefined;
}

export const OPTIONAL_COLUMNS: OptionalColumn[] = [
  { key: "pillar", label: "Pillar", value: (row) => row.pillarName },
  { key: "subPillar", label: "Sub-Pillar", value: (row) => row.subPillarName },
];

/**
 * "Columns" — lets each person switch on the optional columns above. Any
 * column switched on widens the grid, which then scrolls sideways with
 * Project / Task pinned on the left.
 */
export function ColumnsPicker({
  columns,
  visibleKeys,
  onChange,
}: {
  columns: OptionalColumn[];
  visibleKeys: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = visibleKeys.length;

  function toggle(key: string) {
    onChange(visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Show or hide extra columns next to Project / Task"
        className={clsx(
          "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
          activeCount > 0
            ? "border-brand-primary bg-blue-50 text-brand-primary"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        )}
      >
        <IconColumns size={15} />
        Columns
        {activeCount > 0 && <span className="ml-0.5 text-[11px] font-normal text-gray-500">({activeCount})</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-card">
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Show columns</p>
            {columns.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={visibleKeys.includes(c.key)}
                  onChange={() => toggle(c.key)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
