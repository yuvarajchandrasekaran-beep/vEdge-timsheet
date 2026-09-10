import { useMemo, useRef, useState } from "react";
import { IconSearch, IconX } from "./icons";

export interface SelectableUser {
  id: string;
  name: string;
  department?: string;
}

export function UserMultiSelectTypeahead({
  users,
  selectedIds,
  onChange,
  placeholder = "Search people by name…",
  disabled,
}: {
  users: SelectableUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedUsers = useMemo(() => users.filter((u) => selectedSet.has(u.id)), [users, selectedSet]);

  const filtered = useMemo(() => {
    const available = users.filter((u) => !selectedSet.has(u.id));
    if (!query.trim()) return available;
    const q = query.toLowerCase();
    return available.filter((u) => u.name.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q));
  }, [users, selectedSet, query]);

  function add(user: SelectableUser) {
    onChange([...selectedIds, user.id]);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((existing) => existing !== id));
  }

  return (
    <div>
      {selectedUsers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-primary"
            >
              {u.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  className="rounded-full p-0.5 hover:bg-brand-primary/10"
                  aria-label={`Remove ${u.name}`}
                >
                  <IconX size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative" ref={containerRef}>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-primary">
          <IconSearch size={14} className="text-gray-300" />
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
                if (filtered[highlight]) add(filtered[highlight]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed"
          />
        </div>

        {open && filtered.length > 0 && (
          <div className="absolute z-20 mt-1.5 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-card">
            {filtered.map((u, idx) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(u)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  idx === highlight ? "bg-blue-50 text-brand-primary" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="font-medium">{u.name}</span>
                {u.department && <span className="text-xs text-gray-400">{u.department}</span>}
              </button>
            ))}
          </div>
        )}
        {open && query.trim() && filtered.length === 0 && (
          <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm text-gray-400 shadow-card">
            No matching user found.
          </div>
        )}
      </div>
    </div>
  );
}
