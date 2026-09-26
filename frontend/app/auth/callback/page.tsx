"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth, getErrorMessage } from "@/lib/auth-context";
import { User } from "@/lib/types";
export default function Callback() {
  const { setSession } = useAuth(); const router = useRouter();
  const started = useRef(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    window.history.replaceState(null, "", window.location.pathname);
    api.post<{ token: string; user: User }>("/api/auth/exchange", { code }).then((data) => { setSession(data); router.replace("/dashboard"); }).catch((err) => setError(getErrorMessage(err)));
  }, [setSession, router]);
  return <main className="mx-auto mt-24 max-w-md p-5">{error ? <><p className="error">{error}</p><Link className="mt-4 block text-brand-600" href="/login">Return to sign in</Link></> : <p>Completing Google sign-in…</p>}</main>;
}
