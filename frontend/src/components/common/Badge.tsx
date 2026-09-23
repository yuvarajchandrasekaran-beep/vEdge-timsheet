import type { ReactNode } from "react";
import clsx from "clsx";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  neutral: "bg-gray-100 text-gray-600 ring-gray-500/20",
  brand: "bg-blue-50 text-brand-primary ring-brand-primary/20",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const PROJECT_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  COMPLETED: "info",
  ON_HOLD: "warning",
  ARCHIVED: "neutral",
};

const TIMESHEET_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  RECALLED: "neutral",
};

const USER_STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
};

export function StatusBadge({ status, kind }: { status: string; kind: "project" | "timesheet" | "user" }) {
  const map = kind === "project" ? PROJECT_STATUS_TONE : kind === "timesheet" ? TIMESHEET_STATUS_TONE : USER_STATUS_TONE;
  const tone = map[status] ?? "neutral";
  const label = status.replace(/_/g, " ");
  return <Badge tone={tone}>{label}</Badge>;
}
