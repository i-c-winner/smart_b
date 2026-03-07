"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { me } from "@/shared/api/auth-api";
import { clearToken, getToken, setToken } from "@/shared/lib/token-storage";
import type { User } from "@/shared/types/domain";

type AuthContextValue = {
  token: string | null;
  currentUser: User | null;
  loading: boolean;
  loginWithToken: (jwt: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (candidate: string | null) => {
    if (!candidate) {
      setTokenState(null);
      setCurrentUser(null);
      setLoading(false);
      return;
    }
    try {
      const user = await me(candidate);
      setTokenState(candidate);
      setCurrentUser(user);
    } catch {
      clearToken();
      setTokenState(null);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate(getToken());
  }, [hydrate]);

  const loginWithToken = useCallback(
    async (jwt: string) => {
      setLoading(true);
      setToken(jwt);
      await hydrate(jwt);
    },
    [hydrate]
  );

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setCurrentUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, currentUser, loading, loginWithToken, logout }),
    [token, currentUser, loading, loginWithToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
