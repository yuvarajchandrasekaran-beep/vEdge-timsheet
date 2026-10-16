import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../api/client";
import { Spinner } from "../components/common/Spinner";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function LoginPage() {
  const { login, loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Password sign-in is a deliberate break-glass fallback (Google outage, a
  // misconfigured client, an account Google can't reach) rather than the
  // everyday path — collapsed by default so it doesn't read as a second,
  // equally-valid option next to the Google button.
  const [showPasswordForm, setShowPasswordForm] = useState(!GOOGLE_CLIENT_ID);

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

  async function handleGoogleCredential(credential: string) {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(credential);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't sign in with that Google account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0B1130] via-[#142F6E] to-[#1B4298] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/logo.svg" alt="Vivid Edge Integration COE" className="h-16 w-auto" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">TimeSync</h1>
          <p className="mt-1 text-sm text-gray-500">Vivid Edge Integration COE — Timesheets &amp; Approvals</p>
        </div>

        {GOOGLE_CLIENT_ID && (
          <div className="mb-5">
            <GoogleSignInButton clientId={GOOGLE_CLIENT_ID} onCredential={handleGoogleCredential} />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-100">
            {error}
          </div>
        )}

        {GOOGLE_CLIENT_ID && !showPasswordForm && (
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            className="w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            Trouble signing in? Use your password instead
          </button>
        )}

        {showPasswordForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {GOOGLE_CLIENT_ID && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium uppercase tracking-wide text-gray-400">password sign-in</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            )}
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

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-dark disabled:opacity-60"
            >
              {submitting && <Spinner size={16} className="text-white" />}
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
