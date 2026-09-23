import { NavLink } from "react-router-dom";
import clsx from "clsx";

const VIEWS = [
  { to: "/timesheets", label: "Monthly", end: true },
  { to: "/timesheets/fortnight", label: "Fortnight" },
  { to: "/timesheets/weekly", label: "Weekly" },
  { to: "/timesheets/day", label: "Daily" },
];

export function TimesheetViewSwitcher() {
  return (
    <div className="flex gap-1 self-start rounded-xl bg-gray-100 p-1">
      {VIEWS.map((v) => (
        <NavLink
          key={v.to}
          to={v.to}
          end={v.end}
          className={({ isActive }) =>
            clsx(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
            )
          }
        >
          {v.label}
        </NavLink>
      ))}
    </div>
  );
}
