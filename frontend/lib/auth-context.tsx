"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setSession: (data: { token: string; user: User }) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem("token"),
  );
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    api
      .get<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post<{ token: string; user: User }>("/api/auth/login", {
      email,
      password,
    });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  }

  function setSession(data: { token: string; user: User }) {
    localStorage.setItem("token", data.token);
    setUser(data.user);
  }

  async function refreshUser() {
    const data = await api.get<{ user: User }>("/api/auth/me");
    setUser(data.user);
  }

  async function signup(name: string, email: string, password: string) {
    const data = await api.post<{ token: string; user: User }>("/api/auth/signup", {
      name,
      email,
      password,
    });
    localStorage.setItem("token", data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setSession, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
