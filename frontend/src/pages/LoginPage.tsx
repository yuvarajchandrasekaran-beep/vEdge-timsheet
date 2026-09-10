import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../api/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../data/demoAccounts";
import { ROLE_LABELS } from "../types";
import { Avatar } from "../components/common/Avatar";
import { Spinner } from "../components/common/Spinner";

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDemo, setShowDemo] = useState(true);

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Invalid email or password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0B1130] via-[#142F6E] to-[#1B4298] px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="w-full rounded-2xl bg-white p-8 shadow-2xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/brand/logo.svg" alt="Vivid Edge Integration COE" className="h-16 w-auto" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">TimeSync</h1>
            <p className="mt-1 text-sm text-gray-500">Vivid Edge Integration COE — Timesheets &amp; Approvals</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email address</label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@vivid-edge.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-dark disabled:opacity-60"
            >
              {submitting && <Spinner size={16} className="text-white" />}
              Sign in
            </button>
          </form>
        </div>

        <div className="w-full rounded-2xl bg-white/95 p-6 shadow-2xl backdrop-blur">
          <button
            className="mb-3 flex w-full items-center justify-between text-left"
            onClick={() => setShowDemo((v) => !v)}
          >
            <span className="text-sm font-semibold text-gray-900">Demo accounts (evaluation only)</span>
            <span className="text-xs text-brand-primary">{showDemo ? "Hide" : "Show"}</span>
          </button>
          {showDemo && (
            <div className="space-y-1.5">
              <p className="mb-2 text-xs text-gray-500">
                Click an account to autofill credentials, then Sign in. Password for all seed users:{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">{DEMO_PASSWORD}</code>
              </p>
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left transition-colors hover:border-brand-primary/40 hover:bg-blue-50/50"
                >
                  <Avatar name={acc.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{acc.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {acc.employeeId} · {acc.jobTitle}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {ROLE_LABELS[acc.role]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
