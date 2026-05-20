import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { apiRequest, tokenStore } from "../services/api";
import type { User } from "../types/api";

type AuthContextValue = {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthResponse = {
  token: string;
  user: User;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser,
      login: async (email, password) => {
        const response = await apiRequest<AuthResponse>("/auth/login", {
          method: "POST",
          body: { email, password }
        });
        tokenStore.set(response.token);
        setUser(response.user);
      },
      register: async (name, email, password) => {
        const response = await apiRequest<AuthResponse>("/auth/register", {
          method: "POST",
          body: { name, email, password }
        });
        tokenStore.set(response.token);
        setUser(response.user);
      },
      logout: () => {
        tokenStore.clear();
        setUser(null);
      }
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
