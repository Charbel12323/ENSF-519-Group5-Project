"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { getErrorMessage, useAuth } from "@/lib/auth-context";
import { User } from "@/lib/types";
export default function Profile() { const { user } = useAuth(); return <AppShell>{user && <ProfileForm user={user} />}</AppShell>; }
function ProfileForm({ user }: { user: User }) {
  const { setSession, refreshUser } = useAuth();
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email); const [password, setPassword] = useState("");
  const [google, setGoogle] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { api.get<{ google: boolean }>("/api/auth/providers").then((data) => setGoogle(data.google)).catch(() => {}); }, []);
  async function act(work: () => Promise<void>) { setBusy(true); setError(null); setMessage(null); try { await work(); } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); } }
  function save(e: FormEvent) { e.preventDefault(); void act(async () => {
    const data = await api.patch<{ token: string; user: User; emailSent: boolean }>("/api/auth/profile", { name, email, currentPassword: password || undefined });
    setSession(data); setPassword(""); setMessage(data.emailSent ? "Profile saved." : "Profile saved, but verification email delivery failed. Please resend it later.");
  }); }
  return <div className="max-w-xl space-y-5"><h1 className="text-2xl font-semibold">Your profile</h1>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <form className="panel space-y-4" onSubmit={save}>
      <label className="block text-sm">Name<input className="field mt-1" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block text-sm">Email<input className="field mt-1" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {email !== user.email && <><label className="block text-sm">Current password<input className="field mt-1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><p className="text-xs text-slate-500">Changing email requires verification again and disconnects Google. If you signed up with Google, use password reset to set a password first.</p></>}
      <button className="btn-primary" disabled={busy}>Save profile</button>
    </form>
    <section className="panel"><h2 className="font-semibold">Email verification</h2><p className="mt-2 text-sm">{user.emailVerified ? "Your email is verified." : "Check your email for a verification link."}</p>
      {!user.emailVerified && <div className="mt-3 flex gap-2"><button className="btn" disabled={busy} onClick={() => void act(async () => { const result = await api.post<{ message: string }>("/api/auth/resend-verification"); setMessage(result.message); })}>Resend verification</button><button className="btn" disabled={busy} onClick={() => void act(async () => { await refreshUser(); setMessage("Verification status refreshed."); })}>Check status</button></div>}
    </section>
    <section className="panel"><h2 className="font-semibold">Sign-in methods</h2><Link className="mt-3 block text-sm text-brand-600" href="/forgot-password">{user.hasPassword ? "Reset password" : "Set a password by email"}</Link>
      {user.googleConnected ? <p className="mt-3 text-sm text-slate-500">Google is connected.</p> : google && <button className="btn mt-3" disabled={busy || !user.emailVerified} onClick={() => void act(async () => { const { url } = await api.post<{ url: string }>("/api/auth/google/link"); window.location.assign(url); })}>Connect Google</button>}
    </section>
  </div>;
}
