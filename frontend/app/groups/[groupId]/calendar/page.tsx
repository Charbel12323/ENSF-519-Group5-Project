"use client";
import { use, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import GroupNav from "@/components/GroupNav";
import TaskModal from "@/components/TaskModal";
import MilestoneModal from "@/components/MilestoneModal";
import { useAuth } from "@/lib/auth-context";
import { addDays, dateKey, daysBetween, formatDay, isOverdue, parseKey, STATUS_LABEL, STATUS_STYLE, statusResolver, todayKey } from "@/lib/status";
import { Milestone, StatusCategory, Task } from "@/lib/types";
import { useGroupTasks } from "@/lib/use-group-tasks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
interface CalendarFilters { assigneeId: string; status: string; overdue: boolean; from: string; to: string }
const emptyFilters: CalendarFilters = { assigneeId: "", status: "", overdue: false, from: "", to: "" };

/** The day a task is shown on: its due date, or its start date when it has no due date. */
const anchor = (task: Task) => (task.dueDate ?? task.startDate)?.slice(0, 10) ?? null;
const initials = (name: string) => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export default function CalendarPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth();
  const { group, tasks, milestones, loading, error, modal, setModal, saving, load, save, remove, reschedule, saveMilestone, deleteMilestone } = useGroupTasks(groupId, { milestones: true });
  const [milestoneModal, setMilestoneModal] = useState<Milestone | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [filters, setFilters] = useState(emptyFilters);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = todayKey();
  const statusOf = useMemo(() => statusResolver(group?.columns ?? []), [group]);
  const status = (task: Task): StatusCategory | "OVERDUE" => (isOverdue(task, statusOf(task.columnId), today) ? "OVERDUE" : statusOf(task.columnId));

  const dated = useMemo(() => tasks.filter(anchor), [tasks]);
  const matches = (task: Task) => {
    const day = anchor(task), category = statusOf(task.columnId);
    return (!filters.assigneeId || (filters.assigneeId === "unassigned" ? !task.assignee : task.assignee?.id === filters.assigneeId)) &&
      (!filters.status || category === filters.status) && (!filters.overdue || isOverdue(task, category, today)) &&
      // Undated tasks can't fall inside a date range, so a range filter hides them.
      (!filters.from || (!!day && day >= filters.from)) && (!filters.to || (!!day && day <= filters.to));
  };
  const visible = dated.filter(matches);
  const undated = tasks.filter((t) => !anchor(t));
  const visibleUndated = undated.filter(matches);
  const byDay = new Map<string, Task[]>();
  for (const task of visible) byDay.set(anchor(task)!, [...(byDay.get(anchor(task)!) ?? []), task]);
  // Milestones follow the date range filter; task-only filters (assignee, status, overdue) don't apply to them.
  const milestonesByDay = new Map<string, Milestone[]>();
  for (const m of milestones) {
    const day = m.dueDate.slice(0, 10);
    if ((!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)) milestonesByDay.set(day, [...(milestonesByDay.get(day) ?? []), m]);
  }
  const isOwner = group?.ownerId === user?.id;
  const hasItems = (day: string) => byDay.has(day) || milestonesByDay.has(day);
  const milestoneChip = (m: Milestone) => <button key={m.id} onClick={() => { if (isOwner) setMilestoneModal(m); }}
    title={`Milestone: ${m.title} · ${formatDay(m.dueDate)}${m.description ? `\n${m.description}` : ""}${isOwner ? "" : "\nOnly the group owner can edit milestones."}`}
    className={`flex w-full items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-left text-xs font-medium text-amber-800 ${isOwner ? "hover:bg-amber-100" : "cursor-default"}`}>
    <span className="h-2 w-2 shrink-0 rotate-45 bg-amber-500" /><span className="min-w-0 flex-1 truncate">{m.title}</span>
  </button>;

  // Six-week grid starting on the Monday on or before the 1st of the month.
  const first = dateKey(month);
  const gridStart = addDays(first, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthDays = days.filter((d) => parseKey(d).getMonth() === month.getMonth());
  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const filtering = Object.values(filters).some(Boolean);

  function drop(day: string, taskId: string) {
    setDragOver(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const from = anchor(task);
    // Unscheduled task dropped on a day: that day becomes its due date.
    if (!from) { void reschedule(task, { startDate: null, dueDate: day }); return; }
    if (from === day) return;
    // Move the whole task so its duration is preserved.
    const delta = daysBetween(from, day);
    void reschedule(task, {
      startDate: task.startDate ? addDays(task.startDate.slice(0, 10), delta) : null,
      dueDate: task.dueDate ? addDays(task.dueDate.slice(0, 10), delta) : null,
    });
  }

  const chip = (task: Task) => {
    const s = status(task);
    return <button key={task.id} draggable={!saving} onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => setModal({ mode: "edit", task })}
      title={`${task.title} · ${STATUS_LABEL[s]} · ${task.assignee?.name ?? "Unassigned"}${task.dueDate ? ` · Due ${formatDay(task.dueDate)}` : ""}${task.startDate ? ` · Starts ${formatDay(task.startDate)}` : ""}`}
      className={`flex w-full items-center gap-1 rounded border px-1.5 py-0.5 text-left text-xs ${STATUS_STYLE[s].chip} ${saving ? "cursor-wait" : "cursor-grab"}`}>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {task.assignee && <span className="shrink-0 text-[10px] font-semibold opacity-70">{initials(task.assignee.name)}</span>}
    </button>;
  };

  return <AppShell>
    <GroupNav groupId={groupId} groupName={group?.name} title="Calendar" />
    {error && <p className="error mt-4" role="alert">{error}</p>}
    {loading ? <p className="mt-4 text-sm text-slate-500">Loading calendar…</p> : group && <>
      <div className="panel mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <select className="field" aria-label="Filter assignee" value={filters.assigneeId} onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{group.members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select>
        <select className="field" aria-label="Filter status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{(["TODO", "IN_PROGRESS", "DONE"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })} />Overdue only</label>
        <label className="text-xs text-slate-500">From<input className="field" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="text-xs text-slate-500">To<input className="field" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button className="btn" disabled={!filtering} onClick={() => setFilters(emptyFilters)}>Clear filters</button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
          <button className="btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
          <button className="btn" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
          <h2 className="ml-2 text-lg font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-slate-600">{(["TODO", "IN_PROGRESS", "DONE", "OVERDUE"] as const).map((s) => <li key={s} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} />{STATUS_LABEL[s]}</li>)}<li className="flex items-center gap-1"><span className="h-2 w-2 rotate-45 bg-amber-500" />Milestone</li></ul>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {filtering ? `${visible.length + visibleUndated.length} of ${tasks.length} tasks match the filters. ` : `All ${tasks.length} tasks shown. `}
        Tasks appear on their due date. Drag a task to another day to reschedule it.
      </p>

      {undated.length > 0 && <section className="panel mt-4 p-3" onDragOver={(e) => e.preventDefault()}>
        <h3 className="text-sm font-semibold text-slate-800">No date <span className="font-normal text-slate-500">· {visibleUndated.length}{filtering && ` of ${undated.length}`}</span></h3>
        <p className="text-xs text-slate-500">These tasks have no start or due date. Drag one onto a day to set its due date, or click it to edit.</p>
        {visibleUndated.length === 0 ? <p className="mt-2 text-xs text-slate-400">No undated tasks match the filters.</p>
          : <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">{visibleUndated.map(chip)}</div>}
      </section>}

      {tasks.length === 0 && milestones.length === 0 && <div className="panel mt-4 text-center text-sm text-slate-500">No tasks yet. Click a day&apos;s <strong>+</strong> or add a due date to a task on the board.</div>}

      {/* Month grid (tablet and up) */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">{WEEKDAYS.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = parseKey(day).getMonth() === month.getMonth();
            const items = byDay.get(day) ?? [];
            return <div key={day} onDragOver={(e) => { if (!saving) { e.preventDefault(); setDragOver(day); } }} onDragLeave={() => setDragOver((d) => (d === day ? null : d))}
              onDrop={(e) => { e.preventDefault(); drop(day, e.dataTransfer.getData("text/plain")); }}
              className={`group min-h-[112px] border-b border-r border-slate-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-slate-50/70"} ${dragOver === day ? "bg-brand-50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${day === today ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-400"}`}>{parseKey(day).getDate()}</span>
                <button aria-label={`Add task due ${formatDay(day)}`} disabled={saving} className="rounded px-1 text-sm text-slate-400 opacity-0 hover:bg-slate-100 hover:text-brand-600 focus:opacity-100 group-hover:opacity-100"
                  onClick={() => setModal({ mode: "create", defaults: { dueDate: day } })}>+</button>
              </div>
              <div className="mt-1 max-h-28 space-y-1 overflow-y-auto">{milestonesByDay.get(day)?.map(milestoneChip)}{items.map(chip)}</div>
            </div>;
          })}
        </div>
      </div>

      {/* Agenda list (phones) */}
      <div className="mt-4 space-y-3 sm:hidden">
        {monthDays.filter(hasItems).length === 0 && (tasks.length > 0 || milestones.length > 0) && <p className="panel text-sm text-slate-500">No tasks this month.</p>}
        {monthDays.filter(hasItems).map((day) => <section key={day} className="panel p-3">
          <h3 className={`text-sm font-semibold ${day === today ? "text-brand-700" : ""}`}>{formatDay(day, { weekday: "short", month: "short", day: "numeric" })}{day === today && " · Today"}</h3>
          <div className="mt-2 space-y-1">{milestonesByDay.get(day)?.map(milestoneChip)}{byDay.get(day)?.map(chip)}</div>
        </section>)}
      </div>

      {modal && <TaskModal mode={modal.mode} task={modal.mode === "edit" ? modal.task : undefined} defaults={modal.mode === "create" ? modal.defaults : undefined}
        columns={group.columns} members={group.members} labels={group.labels} tasks={tasks} owner={group.ownerId === user?.id} saving={saving}
        onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? remove : undefined} onChanged={load} />}
      {milestoneModal && <MilestoneModal milestone={milestoneModal} saving={saving} onClose={() => setMilestoneModal(null)}
        onSave={async (values) => { await saveMilestone(milestoneModal.id, values); setMilestoneModal(null); }}
        onDelete={async () => { await deleteMilestone(milestoneModal.id); setMilestoneModal(null); }} />}
    </>}
  </AppShell>;
}
