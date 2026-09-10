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
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2 focus-within:border-brand-primary">
        <IconPlus size={15} className="text-gray-400" />
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
          placeholder="Add a project / task to this week…"
          className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed"
        />
        <IconSearch size={14} className="text-gray-300" />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-card">
          {filtered.map((option, idx) => (
            <button
              key={option.projectTaskId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(option)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                idx === highlight ? "bg-blue-50 text-brand-primary" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium">{option.projectName}</span>
              <span className="ml-1.5 text-gray-400">· {option.taskName}</span>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm text-gray-400 shadow-card">
          No matching assigned project/task found.
        </div>
      )}
    </div>
  );
}
