import clsx from "clsx";
import { IconCalendar } from "../common/icons";

/**
 * "Compact view" — on by default, hides Saturday/Sunday columns since most
 * projects only track a Mon–Fri week. Toggling it off brings weekends back
 * for the rare case someone needs to log time on one.
 */
export function CompactViewToggle({ showWeekends, onChange }: { showWeekends: boolean; onChange: (next: boolean) => void }) {
  const compactViewActive = !showWeekends;
  return (
    <button
      type="button"
      onClick={() => onChange(!showWeekends)}
      aria-pressed={compactViewActive}
      title={compactViewActive ? "Showing Mon–Fri only — click to include weekends" : "Showing all 7 days — click to hide weekends again"}
      className={clsx(
        "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
        compactViewActive
          ? "border-brand-primary bg-blue-50 text-brand-primary"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      )}
    >
      <IconCalendar size={15} />
      Compact view
      {!compactViewActive && <span className="ml-0.5 text-[11px] font-normal text-gray-500">(weekends shown)</span>}
    </button>
  );
}
