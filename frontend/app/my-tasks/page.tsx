"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import TaskFilters, { emptyFilters, filterTasks } from "@/components/TaskFilters";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-context";
import { PersonalTask } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";
export default function MyTasks() {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setTasks((await api.get<{ tasks: PersonalTask[] }>("/api/tasks/mine")).tasks); setError(null); } catch (err) { setError(getErrorMessage(err)); } finally { setLoading(false); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes after network responses.
  useEffect(() => { void load(); }, [load]); useLiveRefresh(load);
  const columns = useMemo(() => [...new Map(tasks.map((t) => [t.column.id, { ...t.column, name: `${t.group.name} / ${t.column.name}` }])).values()], [tasks]);
  const labels = useMemo(() => [...new Map(tasks.flatMap((t) => t.labels).map((l) => [l.id, l])).values()], [tasks]);
  const visible = filterTasks(tasks, filters);
  return <AppShell><h1 className="text-2xl font-semibold">My tasks</h1><p className="mt-1 text-sm text-slate-500">Your assignments across all groups, ordered by due date. Updates every 5 seconds.</p>
    <TaskFilters value={filters} onChange={setFilters} columns={columns} labels={labels} />
    {error && <p className="error mt-4">{error}</p>}
    {loading ? <p className="mt-5">Loading tasks…</p> : <div className="mt-5 space-y-3">{visible.length === 0 && <p className="panel text-sm text-slate-500">No matching assignments.</p>}{visible.map((task) => <Link key={task.id} href={`/board/${task.groupId}?task=${task.id}`} className="panel block hover:border-brand-300"><div className="flex justify-between gap-3"><strong>{task.title}</strong><span className="text-xs text-slate-500">{task.priority}</span></div><p className="mt-1 text-sm text-slate-500">{task.group.name} · {task.column.name}{task.dueDate ? ` · Due ${task.dueDate.slice(0, 10)}` : ""}</p></Link>)}</div>}
  </AppShell>;
}
