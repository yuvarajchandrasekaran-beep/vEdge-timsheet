import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getApiErrorMessage } from "../../api/client";
import { IconAlertTriangle } from "../common/icons";

/**
 * Persistent while a Super Admin is impersonating another user — shown
 * regardless of the impersonated user's own role/permissions (impersonation
 * fully assumes their access, so this banner is the only way back). See
 * backend/src/routes/auth.ts's /auth/impersonate endpoints.
 */
export function ImpersonationBanner() {
  const { user, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.impersonation) return null;

  async function handleReturn() {
    setError(null);
    setWorking(true);
    try {
      await stopImpersonating();
      navigate("/users", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't return to your account."));
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 sm:gap-3">
      <IconAlertTriangle size={16} className="shrink-0" />
      <span>
        You're viewing as <strong>{user.name}</strong> — impersonated by {user.impersonation.by.name}.
      </span>
      {error && <span className="text-amber-900">({error})</span>}
      <button
        onClick={handleReturn}
        disabled={working}
        className="rounded-lg bg-amber-950/10 px-3 py-1 font-semibold hover:bg-amber-950/20 disabled:opacity-60"
      >
        {working ? "Returning…" : "Return to my account"}
      </button>
    </div>
  );
}
