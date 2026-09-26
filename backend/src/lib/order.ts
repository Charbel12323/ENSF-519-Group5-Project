import { Db } from "./access";

export function insertAt<T extends { id: string }>(items: T[], item: T, index: number) {
  const result = items.filter((entry) => entry.id !== item.id);
  result.splice(Math.min(Math.max(index, 0), result.length), 0, item);
  return result;
}

export async function normalizeTasks(db: Db, columnId: string, ids?: string[]) {
  const ordered = ids ?? (await db.task.findMany({
    where: { columnId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  })).map((t) => t.id);
  for (const [order, id] of ordered.entries()) {
    await db.task.update({ where: { id }, data: { order, columnId } });
  }
}

export async function orderColumns(db: Db, groupId: string, ids: string[]) {
  // Negative temporary positions avoid the existing (groupId, order) unique constraint.
  for (const [index, id] of ids.entries()) {
    await db.column.update({ where: { id, groupId }, data: { order: -index - 1 } });
  }
  for (const [order, id] of ids.entries()) {
    await db.column.update({ where: { id, groupId }, data: { order } });
  }
}
