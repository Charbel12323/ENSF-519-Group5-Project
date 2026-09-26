"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getErrorMessage, useAuth } from "@/lib/auth-context";
export default function AccountAction({ mode }: { mode: "forgot" | "reset" | "verify" }) {
  const { user, refreshUser } = useAuth();
  const token = useRef("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { const value = new URLSearchParams(window.location.hash.slice(1)).get("token"); if (value) { token.current = value; window.history.replaceState(null, "", window.location.pathname); } }, []);
  const title = mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Verify your email";
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === "forgot") { const result = await api.post<{ message: string }>("/api/auth/forgot-password", { email }); setMessage(result.message); }
      else if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        if (!token.current) throw new Error("Open the password reset link from your email");
        await api.post("/api/auth/reset-password", { token: token.current, password });
        localStorage.removeItem("token"); setMessage("Password updated. Sign in with your new password.");
      } else {
        if (!token.current) throw new Error("Open the verification link from your email");
        await api.post("/api/auth/verify-email", { token: token.current });
        if (user) await refreshUser(); setMessage("Your email is verified. You can now send and accept invitations.");
      }
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center p-5"><div className="panel w-full max-w-md"><Link className="text-sm text-brand-600" href="/">Boardly</Link><h1 className="mt-4 text-xl font-semibold">{title}</h1>
    {error && <p className="error mt-4" role="alert">{error}</p>}
    {message ? <p className="notice mt-4" role="status">{message}</p> : <form className="mt-4 space-y-4" onSubmit={submit}>
      {mode === "forgot" && <label className="block text-sm">Email<input className="field mt-1" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      {mode === "reset" && <><label className="block text-sm">New password<input className="field mt-1" type="password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></label><label className="block text-sm">Confirm new password<input className="field mt-1" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label></>}
      {mode === "verify" && <p className="text-sm text-slate-600">Confirm that you own this email address.</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Verify email"}</button>
    </form>}
    <div className="mt-4 flex gap-4 text-sm text-brand-600"><Link href="/login">Sign in</Link>{mode === "verify" && <Link href="/dashboard">Your groups</Link>}</div>
  </div></main>;
}
