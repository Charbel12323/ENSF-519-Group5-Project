"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-context";
import { GroupDetail } from "@/lib/types";

export default function GroupMembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`);
      setGroup(res.group);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/api/groups/${groupId}/invite`, { email: email.trim() });
      setSuccess(`Invite sent to ${email.trim()}`);
      setEmail("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  return (
    <AppShell>
      <BackLink href="/dashboard" label="Back to groups" />
      <p className="mt-3 text-sm text-slate-500">{group?.name ?? "..."}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Members</h1>

      <form
        onSubmit={handleInvite}
        className="mt-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700">
            Invite by email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@university.edu"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={inviting}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {inviting ? "Sending..." : "Send invite"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Current members
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
            {group?.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{member.user.name}</p>
                  <p className="text-xs text-slate-500">{member.user.email}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    member.role === "OWNER"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {member.role === "OWNER" ? "Owner" : "Member"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
