import axios, { AxiosError } from "axios";
import type { ApiError } from "../types";

// Thin, isolated API client. Every hook module imports this instance only —
// if an endpoint shape changes, this file (plus the one hook module for that
// resource) is the only place to touch.
export const apiClient = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

const TOKEN_KEY = "timesync.accessToken";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors (private browsing etc.)
  }
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Subscribers notified on 401 so the auth context can force a logout.
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export function onUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      unauthorizedListeners.forEach((fn) => fn());
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) {
      // VALIDATION_BLOCKED errors (submit/submit-batch) attach the specific
      // per-entry reasons in `details` — surfacing the first one or two makes
      // the toast actionable ("This week totals 75h, above the 70h limit…")
      // instead of just the generic "has unresolved validation errors".
      const details = Array.isArray(data.details) ? (data.details as { message?: string }[]) : [];
      const detailMessages = [...new Set(details.map((d) => d.message).filter((m): m is string => !!m))];
      if (detailMessages.length > 0) return `${data.message} ${detailMessages.slice(0, 2).join(" ")}`;
      return data.message;
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Triggers a browser download from a Blob response (used by report export buttons). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
