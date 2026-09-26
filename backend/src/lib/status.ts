// Columns are customizable, so status is derived from board position: the first column
// is "not started", the last is "done", and anything in between is "in progress".
// The frontend mirrors this rule in lib/status.ts.
export type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";

export function statusResolver(columns: { id: string; order: number }[]) {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const first = sorted[0]?.id, last = sorted[sorted.length - 1]?.id;
  return (columnId: string): StatusCategory =>
    columnId === last && sorted.length > 1 ? "DONE" : columnId === first ? "TODO" : "IN_PROGRESS";
}

/** Today's date at UTC midnight, matching how @db.Date columns are returned. */
export function startOfToday() {
  return new Date(new Date().toISOString().slice(0, 10));
}
