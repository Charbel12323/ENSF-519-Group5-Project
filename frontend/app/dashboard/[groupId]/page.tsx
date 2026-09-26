"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-context";
import { DashboardStats, GroupDetail } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";

export default function GroupDashboardPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [groupRes, statsRes] = await Promise.all([
        api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`),
        api.get<DashboardStats>(`/api/groups/${groupId}/dashboard`),
      ]);
      setGroup(groupRes.group);
      setStats(statsRes);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);
  useLiveRefresh(load);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading dashboard...</p>
      </AppShell>
    );
  }

  if (error || !group || !stats) {
    return (
      <AppShell>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? "Unable to load this dashboard"}
        </div>
      </AppShell>
    );
  }

  const maxColumnCount = Math.max(1, ...stats.tasksByColumn.map((c) => c.count));
  const maxAssigneeCount = Math.max(1, ...stats.tasksByAssignee.map((a) => a.count), stats.unassignedCount);

  return (
    <AppShell>
      <BackLink href="/dashboard" label="Back to groups" />
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{group.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Dashboard</h1>
        </div>
        <div className="flex gap-3 text-sm font-medium text-brand-600">
          <Link href={`/board/${groupId}`} className="hover:text-brand-700">
            Open board
          </Link>
          <span className="text-slate-300">&middot;</span>
          <Link href={`/groups/${groupId}/members`} className="hover:text-brand-700">
            Members
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Total tasks" value={stats.totalTasks} />
        <StatTile label="Team members" value={stats.totalMembers} />
        <StatTile label="Unassigned" value={stats.unassignedCount} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Tasks by status</h2>
          <div className="mt-4 space-y-3">
            {stats.tasksByColumn.map((column) => (
              <BarRow
                key={column.columnId}
                label={column.columnName}
                value={column.count}
                max={maxColumnCount}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Tasks by assignee</h2>
          <div className="mt-4 space-y-3">
            {stats.tasksByAssignee.map((assignee) => (
              <BarRow
                key={assignee.userId}
                label={assignee.name}
                value={assignee.count}
                max={maxAssigneeCount}
              />
            ))}
            {stats.unassignedCount > 0 && (
              <BarRow label="Unassigned" value={stats.unassignedCount} max={maxAssigneeCount} muted />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  muted = false,
}: {
  label: string;
  value: number;
  max: number;
  muted?: boolean;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={muted ? "text-slate-400" : "text-slate-700"}>{label}</span>
        <span className="tabular-nums text-slate-500">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${muted ? "bg-slate-300" : "bg-brand-500"}`}
          style={{ width: `${value > 0 ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}
