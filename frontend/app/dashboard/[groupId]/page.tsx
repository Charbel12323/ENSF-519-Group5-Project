"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import GroupNav from "@/components/GroupNav";
import { api } from "@/lib/api";
import { getErrorMessage, useAuth } from "@/lib/auth-context";
import { formatDay, STATUS_LABEL, STATUS_STYLE, todayKey } from "@/lib/status";
import { DashboardStats, DeadlineState, GroupDetail } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";

const DEADLINE_STYLE: Record<DeadlineState, { label: string; className: string }> = {
  OVERDUE: { label: "Overdue", className: "bg-red-50 text-red-700 ring-red-200" },
  TODAY: { label: "Due today", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  UPCOMING: { label: "Upcoming", className: "bg-brand-50 text-brand-700 ring-brand-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};
const DEADLINE_TABS: ("ALL" | DeadlineState)[] = ["ALL", "OVERDUE", "TODAY", "UPCOMING", "COMPLETED"];

export default function GroupDashboardPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deadlineTab, setDeadlineTab] = useState<"ALL" | DeadlineState>("ALL");
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  const load = useCallback(async () => {
    try {
      const [groupRes, statsRes] = await Promise.all([
        api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`),
        api.get<DashboardStats>(`/api/groups/${groupId}/dashboard?today=${todayKey()}`),
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
        <GroupNav groupId={groupId} title="Dashboard" />
        <p className="mt-4 text-sm text-slate-500">Loading dashboard...</p>
      </AppShell>
    );
  }

  if (error || !group || !stats) {
    return (
      <AppShell>
        <GroupNav groupId={groupId} groupName={group?.name} title="Dashboard" />
        <div className="error mt-4">{error ?? "Unable to load this dashboard"}</div>
      </AppShell>
    );
  }

  const { summary } = stats;
  const isOwner = group.ownerId === user?.id;
  const maxColumnCount = Math.max(1, ...stats.tasksByColumn.map((c) => c.count));
  const maxWorkload = Math.max(1, ...stats.team.map((m) => m.assigned), stats.unassignedCount);
  const deadlines = stats.deadlines.filter((d) => deadlineTab === "ALL" || d.deadline === deadlineTab);
  const shownDeadlines = showAllDeadlines ? deadlines : deadlines.slice(0, 8);

  return (
    <AppShell>
      <GroupNav groupId={groupId} groupName={group.name} title="Dashboard" />

      {stats.totalTasks === 0 ? (
        <div className="panel mt-6 text-center">
          <p className="text-sm font-medium text-slate-700">No project activity yet.</p>
          <p className="mt-1 text-sm text-slate-500">Create tasks on the <Link className="text-brand-600 underline" href={`/board/${groupId}`}>board</Link> to see progress here.</p>
        </div>
      ) : <>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel sm:col-span-2 lg:col-span-1 lg:row-span-2">
            <p className="text-sm text-slate-500">Project completion</p>
            <div className="mt-3 flex items-center gap-4 lg:flex-col lg:items-start">
              <Donut segments={[{ value: summary.completed, className: "text-emerald-500" }, { value: stats.totalTasks - summary.completed, className: "text-slate-200" }]}
                label={`${summary.completionPercent}%`} caption="complete" />
              <p className="text-sm text-slate-600"><strong className="tabular-nums text-slate-900">{summary.completed}</strong> of <span className="tabular-nums">{stats.totalTasks}</span> tasks completed</p>
            </div>
          </div>
          <StatTile label="Total tasks" value={stats.totalTasks} />
          <StatTile label="Completed" value={summary.completed} dot={STATUS_STYLE.DONE.dot} />
          <StatTile label="In progress" value={summary.inProgress} dot={STATUS_STYLE.IN_PROGRESS.dot} />
          <StatTile label="Not started" value={summary.notStarted} dot={STATUS_STYLE.TODO.dot} />
          <StatTile label="Overdue" value={summary.overdue} dot={STATUS_STYLE.OVERDUE.dot} alert={summary.overdue > 0} />
          <StatTile label={`Due in next ${summary.upcomingDays} days`} value={summary.upcoming} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <h2 className="text-sm font-semibold text-slate-900">Tasks by status</h2>
            <div className="mt-4 space-y-3">
              {stats.tasksByColumn.map((column) => (
                <BarRow key={column.columnId} label={column.columnName} value={column.count} max={maxColumnCount} barClass={STATUS_STYLE[column.status].bar} />
              ))}
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed vs incomplete</h3>
              <StackedBar parts={[
                { label: "Completed", value: summary.completed, className: STATUS_STYLE.DONE.bar },
                { label: "Incomplete", value: stats.totalTasks - summary.completed, className: "bg-slate-300" },
              ]} total={stats.totalTasks} />
            </div>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Workload by assignee</h2>
              <ul className="flex gap-3 text-xs text-slate-500">
                {(["DONE", "IN_PROGRESS", "TODO"] as const).map((s) => <li key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />{STATUS_LABEL[s]}</li>)}
              </ul>
            </div>
            <div className="mt-4 space-y-3">
              {stats.team.map((member) => (
                <div key={member.userId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700">{member.name}</span>
                    <span className="tabular-nums text-slate-500">{member.assigned}</span>
                  </div>
                  <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-100" style={{ width: `${Math.max(member.assigned ? 8 : 100, (member.assigned / maxWorkload) * 100)}%` }}>
                    {member.assigned > 0 && <>
                      <div className={STATUS_STYLE.DONE.bar} style={{ width: `${(member.completed / member.assigned) * 100}%` }} />
                      <div className={STATUS_STYLE.IN_PROGRESS.bar} style={{ width: `${(member.inProgress / member.assigned) * 100}%` }} />
                      <div className={STATUS_STYLE.TODO.bar} style={{ width: `${(member.notStarted / member.assigned) * 100}%` }} />
                    </>}
                  </div>
                </div>
              ))}
              {stats.unassignedCount > 0 && <BarRow label="Unassigned" value={stats.unassignedCount} max={maxWorkload} barClass="bg-slate-300" muted />}
            </div>
          </section>
        </div>

        <section className="panel mt-6 overflow-hidden p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
            <h2 className="text-sm font-semibold text-slate-900">Team progress</h2>
            {!isOwner && <p className="text-xs text-slate-500">Visible to all members of this group.</p>}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-2 font-medium">Member</th><th className="px-3 py-2 text-right font-medium">Assigned</th><th className="px-3 py-2 text-right font-medium">Completed</th><th className="px-3 py-2 text-right font-medium">In progress</th><th className="px-3 py-2 text-right font-medium">Overdue</th><th className="px-5 py-2 font-medium">Completion</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.team.map((m) => (
                  <tr key={m.userId}>
                    <td className="px-5 py-2.5"><p className="font-medium text-slate-800">{m.name}{m.role === "OWNER" && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">OWNER</span>}</p><p className="text-xs text-slate-500">{m.email}</p></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.assigned}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.completed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.inProgress}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${m.overdue ? "font-semibold text-red-600" : ""}`}>{m.overdue}</td>
                    <td className="px-5 py-2.5">
                      {m.assigned === 0 ? <span className="text-xs text-slate-400">No tasks</span> : <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.completionPercent}%` }} /></div>
                        <span className="tabular-nums text-xs text-slate-600">{m.completionPercent}%</span>
                      </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Deadlines</h2>
            <div role="tablist" className="flex flex-wrap gap-1">
              {DEADLINE_TABS.map((tab) => {
                const n = tab === "ALL" ? stats.deadlines.length : stats.deadlines.filter((d) => d.deadline === tab).length;
                return <button key={tab} role="tab" aria-selected={deadlineTab === tab} onClick={() => { setDeadlineTab(tab); setShowAllDeadlines(false); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${deadlineTab === tab ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {tab === "ALL" ? "All" : DEADLINE_STYLE[tab].label} <span className="tabular-nums opacity-75">{n}</span></button>;
              })}
            </div>
          </div>
          {stats.deadlines.length === 0 ? <p className="mt-4 text-sm text-slate-500">No tasks with deadlines yet. Add due dates to tasks to track them here.</p>
            : deadlines.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nothing in this category.</p>
            : <ul className="mt-4 divide-y divide-slate-100">
              {shownDeadlines.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ring-1 ring-inset ${DEADLINE_STYLE[d.deadline].className}`}>{DEADLINE_STYLE[d.deadline].label}</span>
                  <Link href={`/board/${groupId}?task=${d.id}`} className={`min-w-0 flex-1 truncate text-sm font-medium hover:text-brand-700 ${d.deadline === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-800"}`}>{d.title}</Link>
                  <span className="text-xs text-slate-500">{d.assignee?.name ?? "Unassigned"}</span>
                  <span className="w-28 text-right text-xs tabular-nums text-slate-600">{formatDay(d.dueDate, { weekday: "short", month: "short", day: "numeric" })}</span>
                </li>
              ))}
            </ul>}
          {deadlines.length > shownDeadlines.length && <button className="mt-3 text-sm font-medium text-brand-600" onClick={() => setShowAllDeadlines(true)}>Show all {deadlines.length}</button>}
        </section>
      </>}
    </AppShell>
  );
}

function StatTile({ label, value, dot, alert = false }: { label: string; value: number; dot?: string; alert?: boolean }) {
  return (
    <div className="panel">
      <p className="flex items-center gap-1.5 text-sm text-slate-500">{dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${alert ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Donut({ segments, label, caption }: { segments: { value: number; className: string }[]; label: string; caption: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = 40, circumference = 2 * Math.PI * r;
  const lengths = segments.map((s) => (s.value / total) * circumference);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, l) => sum + l, 0));
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0" role="img" aria-label={`${label} ${caption}`}>
      <g transform="rotate(-90 50 50)">
        {segments.map((s, i) => <circle key={i} cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="12" className={s.className}
          strokeDasharray={`${lengths[i]} ${circumference - lengths[i]}`} strokeDashoffset={-offsets[i]} />)}
      </g>
      <text x="50" y="52" textAnchor="middle" className="fill-slate-900 text-[18px] font-semibold">{label}</text>
      <text x="50" y="66" textAnchor="middle" className="fill-slate-500 text-[9px]">{caption}</text>
    </svg>
  );
}

function StackedBar({ parts, total }: { parts: { label: string; value: number; className: string }[]; total: number }) {
  return <>
    <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
      {parts.map((p) => <div key={p.label} className={p.className} style={{ width: `${total ? (p.value / total) * 100 : 0}%` }} />)}
    </div>
    <ul className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
      {parts.map((p) => <li key={p.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${p.className}`} />{p.label} <span className="tabular-nums text-slate-500">{p.value}</span></li>)}
    </ul>
  </>;
}

function BarRow({ label, value, max, barClass, muted = false }: { label: string; value: number; max: number; barClass: string; muted?: boolean }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={muted ? "text-slate-400" : "text-slate-700"}>{label}</span>
        <span className="tabular-nums text-slate-500">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value > 0 ? pct : 0}%` }} />
      </div>
    </div>
  );
}
