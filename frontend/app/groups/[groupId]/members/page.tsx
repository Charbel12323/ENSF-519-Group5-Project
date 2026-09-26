"use client";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import GroupSettings from "@/components/GroupSettings";
import { api } from "@/lib/api";
import { getErrorMessage, useAuth } from "@/lib/auth-context";
import { Activity, GroupDetail } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";

export default function GroupMembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth(); const router = useRouter();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(async () => {
    try {
      setGroup((await api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`)).group);
      if (!expanded) { const data = await api.get<{ activity: Activity[]; nextCursor: string | null }>(`/api/groups/${groupId}/activity`); setActivity(data.activity); setCursor(data.nextCursor); }
    } catch (err) { setError(getErrorMessage(err)); }
  }, [groupId, expanded]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes after network responses.
  useEffect(() => { void load(); }, [load]); useLiveRefresh(load, busy);
  async function act(work: () => Promise<unknown>, refresh = true) {
    setBusy(true); setError(null); setSuccess(null);
    try { await work(); if (refresh) await load(); } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  }
  function invite(e: FormEvent) { e.preventDefault(); void act(async () => {
    const result = await api.post<{ emailSent: boolean }>(`/api/groups/${groupId}/invite`, { email });
    setSuccess(result.emailSent ? `Invitation emailed to ${email}` : "Invitation saved, but email delivery failed. Check SMTP configuration and send it again."); setEmail("");
  }); }
  const owner = group?.ownerId === user?.id;
  return <AppShell>
    <BackLink href="/dashboard" label="Back to groups" />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-500">{group?.name}</p><h1 className="text-2xl font-semibold">Members & settings</h1></div><Link className="text-sm text-brand-600" href={`/board/${groupId}`}>Open board</Link></div>
    {error && <p className="error mt-4" role="alert">{error}</p>}{success && <p className="notice mt-4" role="status">{success}</p>}
    {!group ? <p className="mt-5">{error ? "Unable to load this group." : "Loading group…"}</p> : <div className="mt-5 space-y-6">
      {owner && <form className="panel flex flex-wrap items-end gap-3" onSubmit={invite}><label className="flex-1 text-sm">Invite by email<input className="field mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" /></label><button className="btn-primary" disabled={busy || !user?.emailVerified}>Send invitation</button></form>}
      <section className="panel"><h2 className="font-semibold">Current members</h2><p className="mt-1 text-xs text-slate-500">Owners manage the group, invitations, columns, and labels. All members can collaborate on tasks.</p>
        <ul className="mt-4 divide-y">{group.members.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{member.user.name}</p><p className="text-xs text-slate-500">{member.user.email} · {member.role === "OWNER" ? "Owner" : "Member"}</p></div>
          {owner && member.user.id !== user?.id && <div className="flex gap-2"><button className="btn" disabled={busy} onClick={() => { if (confirm(`Make ${member.user.name} the owner? You will become a regular member.`)) void act(() => api.post(`/api/groups/${groupId}/ownership`, { userId: member.user.id })); }}>Transfer ownership</button><button className="btn-danger" disabled={busy} onClick={() => { if (confirm(`Remove ${member.user.name}? Their assigned tasks will become unassigned.`)) void act(() => api.delete(`/api/groups/${groupId}/members/${member.user.id}`)); }}>Remove</button></div>}
        </li>)}</ul>
        {!owner ? <button className="btn-danger mt-3" disabled={busy} onClick={() => { if (confirm("Leave this group? Your tasks will become unassigned.")) void act(async () => { await api.post(`/api/groups/${groupId}/leave`); router.push("/dashboard"); }); }}>Leave group</button> : <p className="mt-3 text-xs text-slate-500">Transfer ownership to another member before leaving.</p>}
      </section>
      {owner && <GroupSettings group={group} busy={busy} act={act} />}
      <section className="panel"><h2 className="font-semibold">Group activity</h2><ol className="mt-4 space-y-3">{activity.map((a) => <li key={a.id} className="text-sm"><strong>{a.actor.name}</strong> {a.message}<p className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</p></li>)}</ol>
        {cursor && <button className="btn mt-4" disabled={busy} onClick={() => void act(async () => { const data = await api.get<{ activity: Activity[]; nextCursor: string | null }>(`/api/groups/${groupId}/activity?cursor=${cursor}`); setExpanded(true); setActivity((old) => [...new Map([...old, ...data.activity].map((a) => [a.id, a])).values()]); setCursor(data.nextCursor); }, false)}>Load older activity</button>}
        {expanded && <button className="btn ml-2 mt-4" onClick={() => setExpanded(false)}>Show latest activity</button>}
      </section>
    </div>}
  </AppShell>;
}
