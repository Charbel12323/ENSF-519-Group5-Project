"use client";
import { Column, GroupMember, Label, Priority, Task } from "@/lib/types";
export interface Filters { q: string; assigneeId: string; columnId: string; priority: string; labelId: string; due: string }
export const emptyFilters: Filters = { q: "", assigneeId: "", columnId: "", priority: "", labelId: "", due: "" };
export function filterTasks<T extends Task>(tasks: T[], filters: Filters) {
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return tasks.filter((task) => {
    const date = task.dueDate?.slice(0, 10);
    return (!filters.q || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) &&
      (!filters.columnId || task.columnId === filters.columnId) && (!filters.priority || task.priority === filters.priority as Priority) &&
      (!filters.assigneeId || (filters.assigneeId === "unassigned" ? !task.assignee : task.assignee?.id === filters.assigneeId)) &&
      (!filters.labelId || task.labels.some((label) => label.id === filters.labelId)) &&
      (!filters.due || (filters.due === "none" ? !date : !!date && (filters.due === "overdue" ? date < today : filters.due === "today" ? date === today : date >= today && date <= week)));
  });
}
export default function TaskFilters({ value, onChange, columns = [], members, labels = [] }: { value: Filters; onChange: (value: Filters) => void; columns?: Column[]; members?: GroupMember[]; labels?: Label[] }) {
  const set = (key: keyof Filters, v: string) => onChange({ ...value, [key]: v });
  return <div className="panel mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <input className="field" aria-label="Search tasks" placeholder="Search title or description…" value={value.q} onChange={(e) => set("q", e.target.value)} />
    <select className="field" aria-label="Filter status" value={value.columnId} onChange={(e) => set("columnId", e.target.value)}><option value="">All statuses</option>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {members && <select className="field" aria-label="Filter assignee" value={value.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select>}
    <select className="field" aria-label="Filter priority" value={value.priority} onChange={(e) => set("priority", e.target.value)}><option value="">All priorities</option>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</select>
    <select className="field" aria-label="Filter label" value={value.labelId} onChange={(e) => set("labelId", e.target.value)}><option value="">All labels</option>{labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
    <select className="field" aria-label="Filter due date" value={value.due} onChange={(e) => set("due", e.target.value)}><option value="">Any due date</option><option value="overdue">Past due date</option><option value="today">Due today</option><option value="week">Due in 7 days</option><option value="none">No due date</option></select>
    <button className="btn" onClick={() => onChange(emptyFilters)}>Clear filters</button>
  </div>;
}
