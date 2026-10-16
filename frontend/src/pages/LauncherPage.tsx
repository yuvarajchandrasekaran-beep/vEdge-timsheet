import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

interface AppTile {
  id: string;
  name: string;
  description: string;
  iframeSrc?: string;
  comingSoon?: boolean;
  eta?: string;
}

const APPS: AppTile[] = [
  {
    id: "timesync",
    name: "TimeSync",
    description: "Timesheets & approvals",
    iframeSrc: "/dashboard",
  },
  {
    id: "expense-report",
    name: "Expense Report",
    description: "Expense reporting & reimbursements",
    comingSoon: true,
    eta: "Dec 1, 2026",
  },
];

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.75}>
      <path
        d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
    </svg>
  );
}

function TileIcon({ appId }: { appId: string }) {
  return appId === "timesync" ? <ClockIcon /> : <ReceiptIcon />;
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/brand/logo.svg" alt="" className="h-8 w-auto" />
      <span className="text-lg font-bold tracking-tight text-gray-900">VividExpress</span>
    </div>
  );
}

export default function LauncherPage() {
  const { user, logout } = useAuth();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const selectedApp = APPS.find((a) => a.id === selectedAppId) ?? null;

  if (selectedApp) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-app-bg">
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSelectedAppId(null)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2}>
                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All apps
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <BrandMark />
          </div>
          <span className="text-sm font-medium text-gray-500">{selectedApp.name}</span>
        </div>
        <iframe
          key={selectedApp.id}
          src={selectedApp.iframeSrc}
          title={selectedApp.name}
          className="w-full flex-1 border-0"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1130] via-[#142F6E] to-[#1B4298] px-4 py-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/brand/logo.svg" alt="Vivid Edge Integration COE" className="h-8 w-auto" />
          <span className="text-lg font-bold tracking-tight text-white">VividExpress</span>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-white/70">{user.name}</span>}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-5xl text-center">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Choose an application</h1>
        <p className="mt-2 text-sm text-white/60">Pick where you'd like to go — you can always come back here.</p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            disabled={app.comingSoon}
            onClick={() => setSelectedAppId(app.id)}
            className={`group relative overflow-hidden rounded-2xl bg-white p-6 text-left shadow-2xl transition-transform ${
              app.comingSoon ? "cursor-not-allowed opacity-60" : "hover:-translate-y-1"
            }`}
          >
            {app.comingSoon && (
              <span className="absolute right-0 top-4 rounded-l-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Coming soon
              </span>
            )}
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                app.comingSoon ? "bg-gray-100 text-gray-400" : "bg-brand-accent-soft text-brand-primary"
              }`}
            >
              <TileIcon appId={app.id} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-gray-900">{app.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{app.description}</p>
            {app.comingSoon && <p className="mt-3 text-xs font-medium text-gray-400">ETA: {app.eta}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}
