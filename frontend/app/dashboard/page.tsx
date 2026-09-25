"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-context";
import { GroupSummary, Invite } from "@/lib/types";

export default function DashboardOverviewPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [groupsRes, invitesRes] = await Promise.all([
        api.get<{ groups: GroupSummary[] }>("/api/groups"),
        api.get<{ invites: Invite[] }>("/api/invites"),
      ]);
      setGroups(groupsRes.groups);
      setInvites(invitesRes.invites);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post("/api/groups", { name: groupName.trim() });
      setGroupName("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleInviteResponse(inviteId: string, accept: boolean) {
    try {
      await api.post(`/api/invites/${inviteId}/respond`, { accept });
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your groups</h1>
          <p className="mt-1 text-sm text-slate-500">Pick a group to open its board and dashboard.</p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          New group
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreateGroup}
          className="mt-4 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex-1">
            <label htmlFor="group-name" className="block text-sm font-medium text-slate-700">
              Group name
            </label>
            <input
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. ENSF 519 Project Team"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pending invites
          </h2>
          <div className="mt-3 space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <p className="text-sm text-slate-700">
                  <span className="font-medium">{invite.invitedBy.name}</span> invited you to{" "}
                  <span className="font-medium">{invite.group.name}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleInviteResponse(invite.id, true)}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleInviteResponse(invite.id, false)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-slate-500">Loading groups...</p>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">
              You&apos;re not in any groups yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{group.name}</h3>
                  {group.role === "OWNER" && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Owner
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
                  <span>{group.memberCount} members</span>
                  <span>{group.taskCount} tasks</span>
                </div>
                <div className="mt-4 flex gap-3 text-sm font-medium text-brand-600">
                  <Link href={`/board/${group.id}`} className="hover:text-brand-700">
                    Open board
                  </Link>
                  <span className="text-slate-300">&middot;</span>
                  <Link href={`/dashboard/${group.id}`} className="hover:text-brand-700">
                    View dashboard
                  </Link>
                  <span className="text-slate-300">&middot;</span>
                  <Link href={`/groups/${group.id}/members`} className="hover:text-brand-700">
                    Members
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
