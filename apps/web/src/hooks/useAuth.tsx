import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import * as authClient from "../services/auth.client";
import type { User } from "../types/users.types";

type AuthContextValue = {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser,
      login: async (email, password) => {
        const response = await authClient.login(email, password);
        authClient.setToken(response.token);
        setUser(response.user);
      },
      register: async (name, email, password) => {
        const response = await authClient.register(name, email, password);
        authClient.setToken(response.token);
        setUser(response.user);
      },
      logout: () => {
        authClient.clearToken();
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
