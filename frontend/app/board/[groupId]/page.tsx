"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import TaskCard from "@/components/TaskCard";
import TaskModal, { TaskFormValues } from "@/components/TaskModal";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-context";
import { GroupDetail, Task } from "@/lib/types";

export default function BoardPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalState, setModalState] = useState<
    | { mode: "create"; columnId: string }
    | { mode: "edit"; task: Task }
    | null
  >(null);
  const [saving, setSaving] = useState(false);

  const loadBoard = useCallback(async () => {
    try {
      const [groupRes, tasksRes] = await Promise.all([
        api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`),
        api.get<{ tasks: Task[] }>(`/api/groups/${groupId}/tasks`),
      ]);
      setGroup(groupRes.group);
      setTasks(tasksRes.tasks);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    (async () => {
      await loadBoard();
    })();
  }, [loadBoard]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const column of group?.columns ?? []) {
      map.set(
        column.id,
        tasks.filter((t) => t.columnId === column.id).sort((a, b) => a.order - b.order),
      );
    }
    return map;
  }, [group, tasks]);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const movedTask = tasks.find((t) => t.id === draggableId);
    if (!movedTask) return;

    const sourceColumnTasks = [...(tasksByColumn.get(source.droppableId) ?? [])];
    const destColumnTasks =
      source.droppableId === destination.droppableId
        ? sourceColumnTasks
        : [...(tasksByColumn.get(destination.droppableId) ?? [])];

    sourceColumnTasks.splice(source.index, 1);
    destColumnTasks.splice(destination.index, 0, movedTask);

    // Optimistic local reorder so the drag feels instant.
    const updated = tasks.map((t) => {
      if (t.id === movedTask.id) {
        return { ...t, columnId: destination.droppableId };
      }
      return t;
    });
    setTasks(reassignOrders(updated, destination.droppableId, destColumnTasks));

    try {
      await api.patch(`/api/tasks/${movedTask.id}`, {
        columnId: destination.droppableId,
        order: destination.index,
      });
    } catch (err) {
      setError(getErrorMessage(err));
      await loadBoard();
    }
  }

  function reassignOrders(list: Task[], columnId: string, orderedColumnTasks: Task[]) {
    const orderMap = new Map(orderedColumnTasks.map((t, idx) => [t.id, idx]));
    return list.map((t) => {
      if (t.columnId === columnId && orderMap.has(t.id)) {
        return { ...t, order: orderMap.get(t.id)! };
      }
      return t;
    });
  }

  async function handleSave(values: TaskFormValues) {
    setSaving(true);
    setError(null);
    try {
      if (modalState?.mode === "create") {
        const res = await api.post<{ task: Task }>(`/api/groups/${groupId}/tasks`, {
          title: values.title,
          description: values.description || null,
          columnId: values.columnId,
          assigneeId: values.assigneeId || null,
        });
        setTasks((prev) => [...prev, res.task]);
      } else if (modalState?.mode === "edit") {
        const res = await api.patch<{ task: Task }>(`/api/tasks/${modalState.task.id}`, {
          title: values.title,
          description: values.description || null,
          columnId: values.columnId,
          assigneeId: values.assigneeId || null,
        });
        setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
      }
      setModalState(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (modalState?.mode !== "edit") return;
    setSaving(true);
    try {
      await api.delete(`/api/tasks/${modalState.task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== modalState.task.id));
      setModalState(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading board...</p>
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? "Unable to load this board"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackLink href="/dashboard" label="Back to groups" />
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{group.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Board</h1>
        </div>
        <div className="flex gap-3 text-sm font-medium text-brand-600">
          <Link href={`/dashboard/${groupId}`} className="hover:text-brand-700">
            Dashboard
          </Link>
          <span className="text-slate-300">&middot;</span>
          <Link href={`/groups/${groupId}/members`} className="hover:text-brand-700">
            Members
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {group.columns.map((column) => {
            const columnTasks = tasksByColumn.get(column.id) ?? [];
            return (
              <div key={column.id} className="rounded-xl bg-slate-100/70 p-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-700">{column.name}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                    {columnTasks.length}
                  </span>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`mt-3 min-h-[120px] rounded-lg p-1 transition ${
                        snapshot.isDraggingOver ? "bg-brand-50" : ""
                      }`}
                    >
                      {columnTasks.map((task, index) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          index={index}
                          onClick={() => setModalState({ mode: "edit", task })}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>

                <button
                  onClick={() => setModalState({ mode: "create", columnId: column.id })}
                  className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-slate-500 hover:bg-white hover:text-slate-700"
                >
                  + Add task
                </button>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {modalState && (
        <TaskModal
          mode={modalState.mode}
          task={modalState.mode === "edit" ? modalState.task : undefined}
          defaultColumnId={modalState.mode === "create" ? modalState.columnId : undefined}
          columns={group.columns}
          members={group.members}
          onClose={() => setModalState(null)}
          onSave={handleSave}
          onDelete={modalState.mode === "edit" ? handleDelete : undefined}
          saving={saving}
        />
      )}
    </AppShell>
  );
}
