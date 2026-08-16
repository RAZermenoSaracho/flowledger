import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import * as authClient from "../services/auth.client";
import type { User } from "../types/users.types";

type AuthContextValue = {
  user: User | null;
  /** True until the boot-time silent `/auth/refresh` attempt has settled; protected routes should wait for this before deciding to redirect to login. */
  isInitializing: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** React context provider holding the authenticated user and login/register/logout actions; restores a session from the httpOnly refresh cookie on mount. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    authClient
      .refreshSession()
      .then((response) => {
        if (!cancelled) {
          authClient.setToken(response.token);
          setUser(response.user);
        }
      })
      .catch(() => {
        // No valid refresh cookie — the user simply isn't signed in yet.
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Fires when a mid-session silent refresh is exhausted (not the
    // boot-time attempt above) — clear the cache and sign the user out so
    // `ProtectedRoute` redirects to login instead of leaving a stale-but-
    // truthy session on screen with no data behind it.
    authClient.onSessionExpired(() => {
      queryClient.clear();
      setUser(null);
    });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitializing,
      setUser,
      login: async (email, password) => {
        const response = await authClient.login(email, password);
        authClient.setToken(response.token);
        queryClient.clear();
        setUser(response.user);
      },
      register: async (name, email, password) => {
        const response = await authClient.register(name, email, password);
        authClient.setToken(response.token);
        queryClient.clear();
        setUser(response.user);
      },
      logout: async () => {
        await authClient.logout();
        queryClient.clear();
        setUser(null);
      }
    }),
    [user, isInitializing, queryClient]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the current `AuthProvider` context; throws if used outside it. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
