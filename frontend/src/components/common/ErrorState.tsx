import { getApiErrorMessage } from "../../api/client";

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this data",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 py-12 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="max-w-sm text-sm text-gray-500">{getApiErrorMessage(error)}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-soft ring-1 ring-gray-200 hover:bg-gray-50"
        >
          Try again
        </button>
      )}
    </div>
  );
}
