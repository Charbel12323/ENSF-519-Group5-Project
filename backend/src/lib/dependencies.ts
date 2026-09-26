import { Db } from "./access";
import { HttpError } from "../middleware/errorHandler";

export function wouldCycle(taskId: string, blockers: string[], edges: { taskId: string; dependsOnId: string }[]) {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.taskId === taskId) continue;
    graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnId]);
  }
  const queue = [...blockers], visited = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (id === taskId) return true;
    if (visited.has(id)) continue;
    visited.add(id); queue.push(...(graph.get(id) ?? []));
  }
  return false;
}

export async function validateDependencies(db: Db, groupId: string, taskId: string, ids: string[]) {
  const tasks = await db.task.findMany({ where: { id: { in: ids }, groupId } });
  if (tasks.length !== ids.length) throw new HttpError(400, "Dependencies must be distinct tasks in this group");
  const edges = await db.taskDependency.findMany({ where: { task: { groupId } } });
  if (wouldCycle(taskId, ids, edges)) throw new HttpError(400, "Dependencies cannot form a cycle or reference the task itself");
}

export async function assertCanComplete(db: Db, blockerIds: string[]) {
  if (await db.task.count({ where: { id: { in: blockerIds }, column: { isDone: false } } })) {
    throw new HttpError(409, "Finish the blocking tasks before moving this task to a completed column");
  }
}
