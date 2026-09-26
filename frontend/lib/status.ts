import { Column, StatusCategory, Task } from "./types";

// Mirrors backend/src/lib/status.ts: first column = not started, last = done, others = in progress.
export function statusResolver(columns: Column[]) {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const first = sorted[0]?.id, last = sorted[sorted.length - 1]?.id;
  return (columnId: string): StatusCategory =>
    columnId === last && sorted.length > 1 ? "DONE" : columnId === first ? "TODO" : "IN_PROGRESS";
}

export const STATUS_LABEL: Record<StatusCategory | "OVERDUE", string> = { TODO: "To Do", IN_PROGRESS: "In Progress", DONE: "Done", OVERDUE: "Overdue" };
export const STATUS_PROGRESS: Record<StatusCategory, number> = { TODO: 0, IN_PROGRESS: 50, DONE: 100 };
// Chip/bar colours shared by the calendar, timeline and dashboard.
export const STATUS_STYLE: Record<StatusCategory | "OVERDUE", { chip: string; bar: string; dot: string }> = {
  TODO: { chip: "border-slate-300 bg-slate-100 text-slate-700", bar: "bg-slate-400", dot: "bg-slate-400" },
  IN_PROGRESS: { chip: "border-brand-200 bg-brand-50 text-brand-700", bar: "bg-brand-500", dot: "bg-brand-500" },
  DONE: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700 line-through decoration-emerald-400", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  OVERDUE: { chip: "border-red-200 bg-red-50 text-red-700", bar: "bg-red-500", dot: "bg-red-500" },
};

/** YYYY-MM-DD for a local calendar date. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const todayKey = () => dateKey(new Date());
/** Parse YYYY-MM-DD (or an ISO timestamp for a @db.Date column) as a local date. */
export function parseKey(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key: string, days: number) {
  const date = parseKey(key); date.setDate(date.getDate() + days); return dateKey(date);
}
export function daysBetween(from: string, to: string) {
  return Math.round((parseKey(to).valueOf() - parseKey(from).valueOf()) / 86400000);
}
export function formatDay(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return parseKey(value).toLocaleDateString(undefined, options);
}

/** Overdue = due before today and not done. Due dates are whole days, so "due today" is not overdue. */
export function isOverdue(task: Pick<Task, "dueDate">, status: StatusCategory, today = todayKey()) {
  return status !== "DONE" && !!task.dueDate && task.dueDate.slice(0, 10) < today;
}
