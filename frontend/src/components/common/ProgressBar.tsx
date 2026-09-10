import clsx from "clsx";

export function ProgressBar({
  pct,
  className,
  tone,
}: {
  pct: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const resolvedTone = tone ?? (clamped >= 90 ? "danger" : clamped >= 75 ? "warning" : "brand");
  const barClass = {
    brand: "bg-brand-primary",
    success: "bg-status-success",
    warning: "bg-status-warning",
    danger: "bg-status-danger",
  }[resolvedTone];

  return (
    <div className={clsx("h-2 w-full overflow-hidden rounded-full bg-gray-100", className)}>
      <div className={clsx("h-full rounded-full transition-all", barClass)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
