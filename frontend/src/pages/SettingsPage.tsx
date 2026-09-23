import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  useApprovalChains,
  useBrandingSettings,
  useNotificationRules,
  useOrgSettings,
  useUpdateBrandingSettings,
  useUpdateNotificationRules,
  useUpdateOrgSettings,
} from "../hooks/useSettings";
import { useAuditLogs } from "../hooks/useAuditLogs";
import { usePageHeader } from "../hooks/usePageHeader";
import { LoadingBlock } from "../components/common/Spinner";
import { Pagination } from "../components/common/Pagination";
import { ROLE_LABELS, type OrgSettings, type RoleName } from "../types";
import { formatDateTime } from "../utils/format";

type Tab = "organization" | "approvals" | "notifications" | "branding" | "permissions" | "audit";
const TABS: { key: Tab; label: string }[] = [
  { key: "organization", label: "Organization" },
  { key: "approvals", label: "Approval Chains" },
  { key: "notifications", label: "Notification Rules" },
  { key: "branding", label: "Branding" },
  { key: "permissions", label: "Roles & Permissions" },
  { key: "audit", label: "Audit Log" },
];

export default function SettingsPage() {
  usePageHeader("System Settings", "Organization configuration — Super Admin only");
  const [tab, setTab] = useState<Tab>("organization");

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-white text-gray-900 shadow-soft" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "organization" && <OrganizationTab />}
      {tab === "approvals" && <ApprovalChainsTab />}
      {tab === "notifications" && <NotificationRulesTab />}
      {tab === "branding" && <BrandingTab />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "audit" && <AuditLogTab />}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gray-100">{children}</div>;
}

function OrganizationTab() {
  const { data, isLoading } = useOrgSettings();
  const update = useUpdateOrgSettings();
  const [form, setForm] = useState<OrgSettings | null>(null);
  const current = form ?? data ?? null;

  if (isLoading) return <LoadingBlock />;
  if (!current) return <p className="text-sm text-gray-400">Organization settings unavailable.</p>;

  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Organization name</span>
          <input value={current.orgName} onChange={(e) => setForm({ ...current, orgName: e.target.value })} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Timezone</span>
          <input value={current.timezone} onChange={(e) => setForm({ ...current, timezone: e.target.value })} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Week starts on</span>
          <select
            value={current.weekStartsOn}
            onChange={(e) => setForm({ ...current, weekStartsOn: e.target.value as OrgSettings["weekStartsOn"] })}
            className="input"
          >
            <option value="MONDAY">Monday</option>
            <option value="SUNDAY">Sunday</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Daily hour limit</span>
          <input
            type="number"
            value={current.dailyHourLimit}
            onChange={(e) => setForm({ ...current, dailyHourLimit: Number(e.target.value) })}
            className="input"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Weekly hour limit</span>
          <input
            type="number"
            value={current.weeklyHourLimit}
            onChange={(e) => setForm({ ...current, weeklyHourLimit: Number(e.target.value) })}
            className="input"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => current && update.mutate(current)} disabled={update.isPending} className="btn-primary">
          Save changes
        </button>
        {update.isSuccess && <span className="text-sm text-status-success">Saved.</span>}
      </div>
    </Card>
  );
}

function ApprovalChainsTab() {
  const { data, isLoading } = useApprovalChains();

  if (isLoading) return <LoadingBlock />;

  return (
    <Card>
      <p className="mb-4 text-sm text-gray-500">
        The approval model is fixed to a single level — there's nothing to configure here.
      </p>
      <div className="space-y-3">
        {(data ?? []).map((step) => (
          <div key={step.level} className="rounded-xl border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">{ROLE_LABELS[step.approverRole]}</p>
            <p className="mt-1 text-sm text-gray-500">{step.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotificationRulesTab() {
  const { data, isLoading } = useNotificationRules();
  const update = useUpdateNotificationRules();

  if (isLoading) return <LoadingBlock />;
  if (!data?.length) return <Card><p className="text-sm text-gray-400">No notification rules configured.</p></Card>;

  return (
    <Card>
      <div className="divide-y divide-gray-50">
        {data.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{rule.event}</p>
              <p className="text-xs text-gray-500">{rule.description}</p>
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rule.emailEnabled}
                  onChange={(e) => update.mutate(data.map((r) => (r.id === rule.id ? { ...r, emailEnabled: e.target.checked } : r)))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Email
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={rule.inAppEnabled}
                  onChange={(e) => update.mutate(data.map((r) => (r.id === rule.id ? { ...r, inAppEnabled: e.target.checked } : r)))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                In-app
              </label>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BrandingTab() {
  const { data, isLoading } = useBrandingSettings();
  const update = useUpdateBrandingSettings();
  const [form, setForm] = useState<{ primaryColor: string; accentColor: string } | null>(null);
  const current = form ?? (data ? { primaryColor: data.primaryColor, accentColor: data.accentColor } : null);

  if (isLoading) return <LoadingBlock />;
  if (!current || !data) return <p className="text-sm text-gray-400">Branding settings unavailable.</p>;

  return (
    <Card>
      <div className="flex items-center gap-4">
        <img src="/brand/logo.svg" alt="Logo" className="h-14 w-14 rounded-xl border border-gray-100 p-2" />
        <div>
          <p className="text-sm font-medium text-gray-900">Vivid Edge Integration COE logo</p>
          <p className="text-xs text-gray-500">Logo replacement isn't wired to an upload endpoint yet — contact engineering.</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Primary color</span>
          <div className="flex items-center gap-2">
            <input type="color" value={current.primaryColor} onChange={(e) => setForm({ ...current, primaryColor: e.target.value })} className="h-10 w-14 rounded-lg border border-gray-200" />
            <input value={current.primaryColor} onChange={(e) => setForm({ ...current, primaryColor: e.target.value })} className="input" />
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Accent color</span>
          <div className="flex items-center gap-2">
            <input type="color" value={current.accentColor} onChange={(e) => setForm({ ...current, accentColor: e.target.value })} className="h-10 w-14 rounded-lg border border-gray-200" />
            <input value={current.accentColor} onChange={(e) => setForm({ ...current, accentColor: e.target.value })} className="input" />
          </div>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => update.mutate({ ...data, ...current })} disabled={update.isPending} className="btn-primary">
          Save changes
        </button>
        {update.isSuccess && <span className="text-sm text-status-success">Saved.</span>}
      </div>
    </Card>
  );
}

// Read-only reference matrix mirroring CONTRACT.md Section 3 / Section 7 RBAC brackets.
// Static by design — this is documentation of the contract, not live data.
const PERMISSION_MATRIX: { area: string; SUPER_ADMIN: boolean; HR_ADMIN: boolean; PROJECT_ADMIN: boolean; INDIVIDUAL_USER: boolean }[] = [
  { area: "Manage users", SUPER_ADMIN: true, HR_ADMIN: true, PROJECT_ADMIN: false, INDIVIDUAL_USER: false },
  { area: "Manage clients/projects", SUPER_ADMIN: true, HR_ADMIN: false, PROJECT_ADMIN: true, INDIVIDUAL_USER: false },
  { area: "View assigned projects", SUPER_ADMIN: true, HR_ADMIN: true, PROJECT_ADMIN: true, INDIVIDUAL_USER: true },
  { area: "Log own timesheet", SUPER_ADMIN: true, HR_ADMIN: true, PROJECT_ADMIN: true, INDIVIDUAL_USER: true },
  { area: "Approve timesheets", SUPER_ADMIN: true, HR_ADMIN: false, PROJECT_ADMIN: true, INDIVIDUAL_USER: false },
  { area: "Add people to projects/tasks", SUPER_ADMIN: true, HR_ADMIN: false, PROJECT_ADMIN: true, INDIVIDUAL_USER: false },
  { area: "View reports & analytics", SUPER_ADMIN: true, HR_ADMIN: true, PROJECT_ADMIN: true, INDIVIDUAL_USER: false },
  { area: "View audit logs", SUPER_ADMIN: true, HR_ADMIN: true, PROJECT_ADMIN: true, INDIVIDUAL_USER: false },
  { area: "System settings", SUPER_ADMIN: true, HR_ADMIN: false, PROJECT_ADMIN: false, INDIVIDUAL_USER: false },
];

function PermissionsTab() {
  const roles: RoleName[] = ["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"];
  return (
    <Card>
      <p className="mb-4 text-sm text-gray-500">
        Read-only summary of the role &amp; permission model (enforced server-side via RBAC middleware).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="py-2.5 pr-4">Capability</th>
              {roles.map((r) => (
                <th key={r} className="px-3 py-2.5 text-center">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.area} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-gray-800">{row.area}</td>
                {roles.map((r) => (
                  <td key={r} className="px-3 py-2.5 text-center">
                    {row[r] ? <span className="text-status-success">●</span> : <span className="text-gray-200">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const pageSize = 10;
  const { data, isLoading } = useAuditLogs({ page, pageSize, entityType: entityType || undefined });

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="input sm:w-56">
          <option value="">All entity types</option>
          <option value="Timesheet">Timesheet</option>
          <option value="Project">Project</option>
          <option value="User">User</option>
          <option value="Approval">Approval</option>
          <option value="Impersonation">Impersonation</option>
        </select>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !data?.data.length ? (
        <p className="py-8 text-center text-sm text-gray-400">No audit events found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Entity</th>
                  <th className="px-3 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2.5 text-gray-500">{formatDateTime(log.timestamp)}</td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {log.actorName}
                      {log.impersonatedByName && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          as impersonated by {log.impersonatedByName}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{log.action}</td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {log.entityType} #{log.entityId}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{log.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={data.meta.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
