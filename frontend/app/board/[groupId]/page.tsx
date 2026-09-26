"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import TaskCard from "@/components/TaskCard";
import TaskModal, { TaskFormValues } from "@/components/TaskModal";
import TaskFilters, { emptyFilters, filterTasks } from "@/components/TaskFilters";
import { api } from "@/lib/api";
import { getErrorMessage, useAuth } from "@/lib/auth-context";
import { GroupDetail, Task } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";

export default function BoardPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [modal, setModal] = useState<{ mode: "create"; columnId: string } | { mode: "edit"; task: Task } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sequence = useRef(0);
  const openedLink = useRef(false);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [g, t] = await Promise.all([api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`), api.get<{ tasks: Task[] }>(`/api/groups/${groupId}/tasks`)]);
      if (request !== sequence.current) return;
      setGroup(g.group); setTasks(t.tasks); setError(null);
      if (!openedLink.current) {
        openedLink.current = true;
        const id = new URLSearchParams(window.location.search).get("task");
        const task = t.tasks.find((task) => task.id === id);
        if (task) setModal({ mode: "edit", task });
      }
    } catch (err) { if (request === sequence.current) setError(getErrorMessage(err)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [groupId]);
  // Network responses, rather than the effect itself, update state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load, saving || dragging || !!modal);
  const filtered = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const filtering = Object.values(filters).some(Boolean);
  const byColumn = useMemo(() => new Map(group?.columns.map((c) => [c.id, filtered.filter((t) => t.columnId === c.id).sort((a, b) => a.order - b.order)])), [group, filtered]);

  async function dragEnd({ source, destination, draggableId }: DropResult) {
    setDragging(false);
    if (!destination || saving || filtering || (source.droppableId === destination.droppableId && source.index === destination.index)) return;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;
    ++sequence.current;
    setSaving(true); setError(null);
    const sourceTasks = (byColumn.get(source.droppableId) ?? []).filter((t) => t.id !== task.id);
    const destTasks = source.droppableId === destination.droppableId ? sourceTasks : [...(byColumn.get(destination.droppableId) ?? [])];
    destTasks.splice(destination.index, 0, { ...task, columnId: destination.droppableId });
    const other = tasks.filter((t) => t.columnId !== source.droppableId && t.columnId !== destination.droppableId);
    setTasks([...other, ...(source.droppableId === destination.droppableId ? [] : sourceTasks.map((t, order) => ({ ...t, order }))), ...destTasks.map((t, order) => ({ ...t, order }))]);
    try { await api.patch(`/api/tasks/${task.id}`, { columnId: destination.droppableId, order: destination.index }); await load(); }
    catch (err) { await load(); setError(getErrorMessage(err)); }
    finally { setSaving(false); }
  }
  async function save(values: TaskFormValues) {
    setSaving(true); ++sequence.current;
    try {
      const body = { ...values, description: values.description || null, assigneeId: values.assigneeId || null, dueDate: values.dueDate || null };
      if (modal?.mode === "edit") await api.patch(`/api/tasks/${modal.task.id}`, body);
      else await api.post(`/api/groups/${groupId}/tasks`, body);
      setModal(null); await load();
    } finally { setSaving(false); }
  }
  async function remove() {
    if (modal?.mode !== "edit") return;
    setSaving(true); ++sequence.current;
    try { await api.delete(`/api/tasks/${modal.task.id}`); setModal(null); await load(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setSaving(false); }
  }
  return <AppShell>
    <BackLink href="/dashboard" label="Back to groups" />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-500">{group?.name}</p><h1 className="text-2xl font-semibold">Board</h1></div>
      <nav className="flex gap-4 text-sm text-brand-600"><Link href={`/dashboard/${groupId}`}>Dashboard</Link><Link href={`/groups/${groupId}/members`}>Members & settings</Link></nav>
    </div>
    {error && <p className="error mt-4" role="alert">{error}</p>}
    {loading ? <p className="mt-4 text-sm">Loading board…</p> : group && <>
      <TaskFilters value={filters} onChange={setFilters} columns={group.columns} members={group.members} labels={group.labels} />
      <p className="mt-2 text-xs text-slate-500">{filtered.length} of {tasks.length} tasks · {filtering ? "Clear filters to drag and reorder tasks. You can still change status in task details." : "Updates automatically every 5 seconds."}</p>
      <DragDropContext onBeforeDragStart={() => { ++sequence.current; setDragging(true); }} onDragEnd={dragEnd}>
        <div className="mt-5 flex gap-4 overflow-x-auto pb-5">
          {group.columns.map((column) => <section key={column.id} className="w-80 min-w-[280px] flex-1 rounded-xl bg-slate-100/70 p-3">
            <h2 className="flex justify-between px-1 text-sm font-semibold">{column.name}<span className="text-slate-500">{byColumn.get(column.id)?.length ?? 0}</span></h2>
            <Droppable droppableId={column.id} isDropDisabled={filtering || saving}>{(provided, snapshot) => <div ref={provided.innerRef} {...provided.droppableProps} className={`mt-3 min-h-[120px] rounded-lg p-1 ${snapshot.isDraggingOver ? "bg-brand-50" : ""}`}>
              {(byColumn.get(column.id) ?? []).map((task, index) => <TaskCard key={task.id} task={task} index={index} disabled={filtering || saving} onClick={() => { if (!saving) setModal({ mode: "edit", task }); }} />)}
              {provided.placeholder}
            </div>}</Droppable>
            <button className="mt-2 w-full rounded-md p-2 text-left text-sm text-slate-500 hover:bg-white" disabled={saving} onClick={() => setModal({ mode: "create", columnId: column.id })}>+ Add task</button>
          </section>)}
        </div>
      </DragDropContext>
      {modal && <TaskModal mode={modal.mode} task={modal.mode === "edit" ? modal.task : undefined} defaultColumnId={modal.mode === "create" ? modal.columnId : undefined} columns={group.columns} members={group.members} labels={group.labels} owner={group.ownerId === user?.id} saving={saving} onClose={() => setModal(null)} onSave={save} onDelete={modal.mode === "edit" ? remove : undefined} onChanged={load} />}
    </>}
  </AppShell>;
}
