import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, getStoredToken, onUnauthorized, setStoredToken } from "../api/client";
import type { AuthResponse, RoleName, User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: RoleName[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(() => !!getStoredToken());

  // Every query in this app is scoped to "the current user" implicitly (role-based
  // filtering happens server-side, keyed off the bearer token) rather than by
  // including the user's id in the query key. React Query has no way to know a
  // cached ["projects", ...] or ["approvals", ...] result belongs to a *different*
  // person once the token changes — without an explicit clear, switching accounts
  // in the same tab (no full page reload) can silently show the previous user's
  // cached data for up to their queries' staleTime (30s by default, 5min for
  // clients/departments/roles). Clearing on every login/logout/401 closes that gap.
  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    return onUnauthorized(() => {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      queryClient.clear();
    });
  }, [queryClient]);

  // On mount, if a token is persisted, hydrate the user profile via /auth/me.
  useEffect(() => {
    let cancelled = false;
    const existing = getStoredToken();
    if (!existing) {
      setIsLoading(false);
      return;
    }
    apiClient
      .get<User>("/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          setStoredToken(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      // Clear first: guarantees no stale data from whoever was previously
      // logged in in this tab (or an expired prior session) is visible even
      // for the instant before the new user's own queries resolve.
      queryClient.clear();
      const res = await apiClient.post<AuthResponse>("/auth/login", { email, password });
      setStoredToken(res.data.accessToken);
      setToken(res.data.accessToken);
      setUser(res.data.user);
    },
    [queryClient]
  );

  const hasRole = useCallback(
    (...roles: RoleName[]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      logout,
      hasRole,
    }),
    [user, token, isLoading, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
