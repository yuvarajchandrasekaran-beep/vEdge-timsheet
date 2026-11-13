import type { Pillar } from "../../types";

/**
 * Sub-Pillar picker grouped by Pillar — the Pillar is never picked on its
 * own, it follows from the Sub-Pillar. Pillars with no Sub-Pillars yet are
 * left out since there's nothing under them to choose.
 */
export function SubPillarSelect({
  pillars,
  value,
  onChange,
  className,
  disabled,
}: {
  pillars: Pillar[];
  value: string | null | undefined;
  onChange: (subPillarId: string | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={className}
      disabled={disabled}
      aria-label="Sub-Pillar"
      title="Sub-Pillar (the Pillar follows from it)"
    >
      <option value="">No Sub-Pillar</option>
      {pillars
        .filter((p) => p.subPillars.length > 0)
        .map((p) => (
          <optgroup key={p.id} label={p.name}>
            {p.subPillars.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}
