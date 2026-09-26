"use client";
import { use, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import GroupNav from "@/components/GroupNav";
import TaskModal from "@/components/TaskModal";
import CalendarView from "@/components/CalendarView";
import MilestoneModal, { MilestoneValues } from "@/components/MilestoneModal";
import { useAuth } from "@/lib/auth-context";
import { addDays, dateKey, daysBetween, formatDay, isOverdue, parseKey, STATUS_LABEL, STATUS_PROGRESS, STATUS_STYLE, statusResolver, todayKey } from "@/lib/status";
import { Milestone, StatusCategory, Task } from "@/lib/types";
import { useGroupTasks } from "@/lib/use-group-tasks";

const LABEL_W = 220, HEADER_H = 44, MILESTONE_H = 34, ROW_H = 40;
const ZOOMS = { Day: 30, Week: 12, Month: 4 } as const;
type Zoom = keyof typeof ZOOMS;

const first = (task: Task) => (task.startDate ?? task.dueDate)!.slice(0, 10);
const last = (task: Task) => (task.dueDate ?? task.startDate)!.slice(0, 10);

export default function TimelinePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth();
  const data = useGroupTasks(groupId, { milestones: true });
  const { group, tasks, milestones, loading, error, setError, modal, setModal, saving, load, save, remove, saveMilestone: persistMilestone, deleteMilestone: destroyMilestone } = data;
  const [view, setView] = useState<"gantt" | "calendar">("gantt");
  // Honour ?view=calendar (old Calendar links redirect here) and keep the URL in sync.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the URL once after hydration.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "calendar") setView("calendar"); }, []);
  const switchView = (next: "gantt" | "calendar") => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "calendar") url.searchParams.set("view", "calendar"); else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  };
  const [zoom, setZoom] = useState<Zoom>("Week");
  const [milestoneModal, setMilestoneModal] = useState<{ milestone?: Milestone } | null>(null);
  const today = todayKey();
  const isOwner = !!group && group.ownerId === user?.id;
  const statusOf = useMemo(() => statusResolver(group?.columns ?? []), [group]);

  const rows = tasks.filter((t) => t.startDate || t.dueDate).sort((a, b) => first(a).localeCompare(first(b)) || last(a).localeCompare(last(b)) || a.title.localeCompare(b.title));
  const unscheduled = tasks.length - rows.length;
  const overallProgress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + STATUS_PROGRESS[statusOf(t.columnId)], 0) / tasks.length) : 0;

  // Visible range: every task and milestone plus today, padded and aligned to Monday.
  const keys = [today, ...rows.flatMap((t) => [first(t), last(t)]), ...milestones.map((m) => m.dueDate.slice(0, 10))].sort();
  const padded = addDays(keys[0], -3);
  const rangeStart = addDays(padded, -((parseKey(padded).getDay() + 6) % 7));
  const dayCount = Math.max(daysBetween(rangeStart, keys[keys.length - 1]) + 14, 28);
  const ppd = ZOOMS[zoom], chartW = dayCount * ppd;
  const x = (day: string) => daysBetween(rangeStart, day) * ppd;
  const rowY = (i: number) => HEADER_H + MILESTONE_H + i * ROW_H + ROW_H / 2;
  const totalH = HEADER_H + MILESTONE_H + Math.max(rows.length, 1) * ROW_H;

  const days = Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i));
  const months = days.filter((d, i) => i === 0 || parseKey(d).getDate() === 1);
  const ticks = zoom === "Day" ? days : zoom === "Week" ? days.filter((d) => parseKey(d).getDay() === 1) : [];
  const gridStyle = { backgroundImage: `repeating-linear-gradient(to right, rgb(226 232 240) 0 1px, transparent 1px ${ppd * 7}px)` };

  const rowIndex = new Map(rows.map((t, i) => [t.id, i]));
  const links = rows.flatMap((task) => task.dependencies.flatMap(({ dependsOnId }) => {
    const i = rowIndex.get(dependsOnId), j = rowIndex.get(task.id);
    if (i === undefined || j === undefined) return [];
    const blocker = rows[i];
    return [{ id: `${dependsOnId}-${task.id}`, x1: x(last(blocker)) + ppd, y1: rowY(i), x2: x(first(task)), y2: rowY(j),
      // Conflict: the dependent task is scheduled to start before its blocker is due.
      conflict: first(task) <= last(blocker) && statusOf(blocker.columnId) !== "DONE" }];
  }));
  const titles = new Map(tasks.map((t) => [t.id, t.title]));

  async function saveMilestone(values: MilestoneValues) {
    await persistMilestone(milestoneModal?.milestone?.id, values);
    setMilestoneModal(null);
  }
  async function deleteMilestone() {
    const id = milestoneModal?.milestone?.id;
    if (!id) return;
    await destroyMilestone(id);
    setMilestoneModal(null);
  }

  const status = (task: Task): StatusCategory | "OVERDUE" => (isOverdue(task, statusOf(task.columnId), today) ? "OVERDUE" : statusOf(task.columnId));

  return <AppShell>
    <GroupNav groupId={groupId} groupName={group?.name} title="Timeline"
      actions={isOwner && <button className="btn-primary" disabled={saving} onClick={() => { setError(null); setMilestoneModal({}); }}>+ Milestone</button>} />
    {error && <p className="error mt-4" role="alert">{error}</p>}
    {loading ? <p className="mt-4 text-sm text-slate-500">Loading timeline…</p> : group && <>
      <div role="tablist" aria-label="Timeline view" className="relative mt-5 inline-grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
        {/* Sliding highlight behind the selected option */}
        <span aria-hidden="true" className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-brand-600 shadow transition-transform duration-300 ease-out motion-reduce:transition-none ${view === "calendar" ? "translate-x-full" : "translate-x-0"}`} />
        {([["gantt", "Gantt chart"], ["calendar", "Calendar"]] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={view === key} onClick={() => switchView(key)}
          className={`relative z-10 rounded-md px-5 py-1.5 text-sm font-medium transition-colors duration-300 active:scale-95 ${view === key ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>{label}</button>)}
      </div>
      {view === "calendar" ? <div key="calendar" className="animate-view-in"><CalendarView data={data} /></div> : <div key="gantt" className="animate-view-in">
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="panel py-4">
          <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Overall project progress</span><span className="font-semibold tabular-nums">{overallProgress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${overallProgress}%` }} /></div>
          <p className="mt-2 text-xs text-slate-500">Progress per task: To Do 0%, In Progress 50%, Done 100%. {unscheduled > 0 && `${unscheduled} task${unscheduled === 1 ? " has" : "s have"} no dates and ${unscheduled === 1 ? "is" : "are"} not shown.`}</p>
        </div>
        <div role="group" aria-label="Zoom" className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)} className={`rounded px-3 py-1.5 text-sm transition-colors duration-200 active:scale-95 ${zoom === z ? "bg-brand-600 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{z}</button>)}
        </div>
      </div>

      {rows.length === 0 && milestones.length === 0 ? <div className="panel mt-5 text-center text-sm text-slate-500">Add start and due dates to tasks to see them on the timeline.</div> : <>
        <ul className="mt-5 flex flex-wrap gap-4 text-xs text-slate-600">
          {(["TODO", "IN_PROGRESS", "DONE", "OVERDUE"] as const).map((s) => <li key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-4 rounded-sm ${STATUS_STYLE[s].bar}`} />{STATUS_LABEL[s]}</li>)}
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-amber-500" />Milestone</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-px bg-brand-600" />Today</li>
          <li className="flex items-center gap-1.5"><svg width="18" height="8"><path d="M0 4h14" stroke="#94a3b8" strokeWidth="1.5" /><path d="M12 1l4 3-4 3" fill="none" stroke="#94a3b8" strokeWidth="1.5" /></svg>Dependency</li>
          <li className="flex items-center gap-1.5"><svg width="18" height="8"><path d="M0 4h14" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 2" /></svg>Scheduling conflict</li>
        </ul>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="relative" style={{ width: LABEL_W + chartW, height: totalH }}>
            {/* Header */}
            <div className="flex border-b border-slate-200" style={{ height: HEADER_H }}>
              <div className="sticky left-0 z-20 flex items-end border-r border-slate-200 bg-slate-50 px-3 pb-2 text-xs font-medium text-slate-500" style={{ width: LABEL_W }}>Task</div>
              <div className="relative bg-slate-50" style={{ width: chartW }}>
                {months.map((d) => <span key={d} className="absolute top-1 whitespace-nowrap border-l border-slate-300 pl-1 text-xs font-medium text-slate-700" style={{ left: x(d) }}>{formatDay(d, { month: "short", year: "numeric" })}</span>)}
                {ticks.map((d) => <span key={d} className={`absolute bottom-1 text-center text-[10px] ${d === today ? "font-bold text-brand-700" : "text-slate-400"}`} style={{ left: x(d), width: zoom === "Day" ? ppd : undefined }}>{zoom === "Day" ? parseKey(d).getDate() : `${parseKey(d).getDate()}`}</span>)}
              </div>
            </div>
            {/* Milestones */}
            <div className="flex border-b border-slate-200" style={{ height: MILESTONE_H }}>
              <div className="sticky left-0 z-20 flex items-center border-r border-slate-200 bg-white px-3 text-xs font-medium text-slate-500" style={{ width: LABEL_W }}>Milestones</div>
              <div className="relative" style={{ width: chartW, ...gridStyle }}>
                {milestones.map((m) => <button key={m.id} onClick={() => isOwner && setMilestoneModal({ milestone: m })} title={`${m.title} · ${formatDay(m.dueDate, { month: "short", day: "numeric", year: "numeric" })}${m.description ? `\n${m.description}` : ""}`}
                  className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-amber-800 ${isOwner ? "hover:underline" : "cursor-default"}`} style={{ left: x(m.dueDate.slice(0, 10)) + ppd / 2 - 6 }}>
                  <span className="h-3 w-3 shrink-0 rotate-45 border border-amber-600 bg-amber-400" />{m.title}
                </button>)}
              </div>
            </div>
            {/* Task rows */}
            {rows.length === 0 && <div className="flex" style={{ height: ROW_H }}><div className="sticky left-0 z-20 flex items-center border-r border-slate-200 bg-white px-3 text-xs text-slate-400" style={{ width: LABEL_W }}>No scheduled tasks</div><div style={{ width: chartW, ...gridStyle }} /></div>}
            {rows.map((task) => {
              const s = status(task), category = statusOf(task.columnId), start = first(task), end = last(task);
              const ranged = !!(task.startDate && task.dueDate);
              const blockers = task.dependencies.map((d) => titles.get(d.dependsOnId)).filter(Boolean);
              const tip = [task.title, `${STATUS_LABEL[s]} · ${STATUS_PROGRESS[category]}%`, task.assignee?.name ?? "Unassigned",
                task.startDate ? `Start ${formatDay(task.startDate)}` : "No start date", task.dueDate ? `Due ${formatDay(task.dueDate)}` : "No due date",
                ...(blockers.length ? [`Depends on: ${blockers.join(", ")}`] : [])].join("\n");
              return <div key={task.id} className="flex border-b border-slate-100 hover:bg-slate-50/60" style={{ height: ROW_H }}>
                <button onClick={() => setModal({ mode: "edit", task })} className="sticky left-0 z-20 flex flex-col justify-center border-r border-slate-200 bg-white px-3 text-left hover:bg-slate-50" style={{ width: LABEL_W }}>
                  <span className={`truncate text-sm font-medium ${category === "DONE" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span>
                  <span className="truncate text-[11px] text-slate-500"><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${STATUS_STYLE[s].dot}`} />{STATUS_LABEL[s]} · {task.assignee?.name ?? "Unassigned"}</span>
                </button>
                <div className="relative" style={{ width: chartW, ...gridStyle }}>
                  {ranged ? <button onClick={() => setModal({ mode: "edit", task })} title={tip}
                    className={`absolute top-2 flex h-6 items-center overflow-hidden rounded-md transition duration-150 hover:brightness-110 hover:shadow-md active:scale-y-90 text-left text-[11px] font-medium text-white shadow-sm ring-1 ring-inset ring-black/10 ${STATUS_STYLE[s].bar} bg-opacity-40`}
                    style={{ left: x(start), width: Math.max((daysBetween(start, end) + 1) * ppd, 6) }}>
                    <span className={`absolute inset-y-0 left-0 ${STATUS_STYLE[s].bar}`} style={{ width: `${STATUS_PROGRESS[category]}%` }} />
                    <span className="relative truncate px-2 text-slate-900 mix-blend-normal [text-shadow:0_0_2px_white]">{task.title}</span>
                  </button> : <button onClick={() => setModal({ mode: "edit", task })} title={`${tip}\nAdd both a start and due date to show a duration bar.`}
                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${STATUS_STYLE[s].bar}`} style={{ left: x(start) + ppd / 2 }} />}
                </div>
              </div>;
            })}
            {/* Overlay: today, milestone guides, dependency arrows */}
            <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LABEL_W }} width={chartW} height={totalH} aria-hidden="true">
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0l8 4-8 4z" fill="#94a3b8" /></marker>
                <marker id="arrow-conflict" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0l8 4-8 4z" fill="#dc2626" /></marker>
              </defs>
              {milestones.map((m) => { const mx = x(m.dueDate.slice(0, 10)) + ppd / 2; return <line key={m.id} x1={mx} x2={mx} y1={HEADER_H + MILESTONE_H} y2={totalH} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />; })}
              {today >= rangeStart && <line x1={x(today) + ppd / 2} x2={x(today) + ppd / 2} y1={HEADER_H} y2={totalH} stroke="#4f46e5" strokeWidth="1.5" />}
              {links.map((l) => {
                const bend = Math.max(l.x1 + 8, Math.min(l.x2 - 8, l.x1 + 8));
                const d = l.x2 - 8 >= l.x1 + 8
                  ? `M${l.x1} ${l.y1} H${bend} V${l.y2} H${l.x2 - 1}`
                  : `M${l.x1} ${l.y1} h8 V${(l.y1 + l.y2) / 2} H${l.x2 - 10} V${l.y2} H${l.x2 - 1}`;
                return <path key={l.id} d={d} fill="none" stroke={l.conflict ? "#dc2626" : "#94a3b8"} strokeWidth="1.5" strokeDasharray={l.conflict ? "4 3" : undefined} markerEnd={`url(#${l.conflict ? "arrow-conflict" : "arrow"})`} />;
              })}
            </svg>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Click a task to edit its dates, status or dependencies. Tasks with only one date appear as a dot.</p>
      </>}

      </div>}

      <section className="panel mt-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-900">Milestones</h2>{!isOwner && <p className="text-xs text-slate-500">Only the group owner can manage milestones.</p>}</div>
        {milestones.length === 0 ? <p className="mt-3 text-sm text-slate-500">No milestones yet.{isOwner && " Use “+ Milestone” to mark key project dates."}</p> :
          <ul className="mt-3 divide-y divide-slate-100">{milestones.map((m) => {
            const key = m.dueDate.slice(0, 10);
            return <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rotate-45 bg-amber-500" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{m.title}</p>{m.description && <p className="truncate text-xs text-slate-500">{m.description}</p>}</div>
              <span className={`text-xs tabular-nums ${key < today ? "text-slate-400" : key === today ? "font-semibold text-amber-700" : "text-slate-600"}`}>{formatDay(key, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
              {isOwner && <button className="text-sm text-brand-600" disabled={saving} onClick={() => setMilestoneModal({ milestone: m })}>Edit</button>}
            </li>;
          })}</ul>}
      </section>

      {view === "gantt" && modal && <TaskModal mode={modal.mode} task={modal.mode === "edit" ? modal.task : undefined} defaults={modal.mode === "create" ? modal.defaults : undefined}
        columns={group.columns} members={group.members} labels={group.labels} tasks={tasks} owner={isOwner} saving={saving}
        onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? remove : undefined} onChanged={load} />}
      {milestoneModal && <MilestoneModal milestone={milestoneModal.milestone} defaultDate={dateKey(new Date())} saving={saving}
        onClose={() => setMilestoneModal(null)} onSave={saveMilestone} onDelete={milestoneModal.milestone ? deleteMilestone : undefined} />}
    </>}
  </AppShell>;
}
