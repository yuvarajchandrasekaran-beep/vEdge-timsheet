import { useMemo, useRef, useState } from "react";
import { IconPlus, IconSearch } from "../common/icons";

export interface TaskOption {
  projectId: string;
  projectTaskId: string;
  projectName: string;
  taskName: string;
}

export function AddProjectRowTypeahead({
  options,
  excludeIds,
  onAdd,
  disabled,
}: {
  options: TaskOption[];
  excludeIds: Set<string>;
  onAdd: (option: TaskOption) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const available = options.filter((o) => !excludeIds.has(o.projectTaskId));
    if (!query.trim()) return available;
    const q = query.toLowerCase();
    return available.filter(
      (o) => o.projectName.toLowerCase().includes(q) || o.taskName.toLowerCase().includes(q)
    );
  }, [options, excludeIds, query]);

  function select(option: TaskOption) {
    onAdd(option);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  return (
    <div className="relative w-full max-w-xs" ref={containerRef}>
      <div
        className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 shadow-sm transition-colors ${
          disabled
            ? "border-gray-200 bg-gray-50"
            : "border-brand-primary/40 bg-blue-50/50 hover:border-brand-primary hover:bg-blue-50 focus-within:border-brand-primary focus-within:bg-blue-50"
        }`}
      >
        <IconPlus size={14} className={disabled ? "text-gray-400" : "text-brand-primary"} />
        <input
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (filtered[highlight]) select(filtered[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Add a project / task…"
          className="w-full min-w-0 bg-transparent text-sm font-medium text-gray-900 placeholder:font-normal placeholder:text-brand-primary/70 focus:outline-none disabled:cursor-not-allowed disabled:placeholder:text-gray-400"
        />
        <IconSearch size={13} className={disabled ? "text-gray-300" : "text-brand-primary/60"} />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1.5 max-h-60 w-full min-w-[280px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-card">
          {filtered.map((option, idx) => (
            <button
              key={option.projectTaskId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                idx === highlight ? "bg-blue-50 text-brand-primary" : "text-gray-800 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium">{option.projectName}</span>
              <span className="ml-1.5 text-gray-500">· {option.taskName}</span>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1.5 w-full min-w-[280px] rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-600 shadow-card">
          No matching assigned project/task found.
        </div>
      )}
    </div>
  );
}
