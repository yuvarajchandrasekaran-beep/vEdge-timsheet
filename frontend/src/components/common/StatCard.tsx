import type { ReactNode } from "react";
import clsx from "clsx";

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
}) {
  const iconTone = {
    brand: "bg-blue-50 text-brand-primary",
    success: "bg-emerald-50 text-status-success",
    warning: "bg-amber-50 text-status-warning",
    danger: "bg-rose-50 text-status-danger",
    info: "bg-sky-50 text-status-info",
  }[tone];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-gray-500">{sublabel}</p>}
        </div>
        {icon && <div className={clsx("flex h-10 w-10 items-center justify-center rounded-xl", iconTone)}>{icon}</div>}
      </div>
    </div>
  );
}
