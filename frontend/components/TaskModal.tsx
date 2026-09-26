"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Column, GroupMember, Label, Priority, Task } from "@/lib/types";
import TaskExtras from "./TaskExtras";

export interface TaskFormValues { title: string; description: string; columnId: string; assigneeId: string; priority: Priority; dueDate: string; labelIds: string[] }
export default function TaskModal({ mode, task, columns, members, labels, owner, defaultColumnId, onClose, onSave, onDelete, onChanged, saving }: {
  mode: "create" | "edit"; task?: Task; columns: Column[]; members: GroupMember[]; labels: Label[]; owner: boolean;
  defaultColumnId?: string; onClose: () => void; onSave: (values: TaskFormValues) => Promise<void>;
  onDelete?: () => Promise<void>; onChanged: () => Promise<void>; saving: boolean;
}) {
  const [values, setValues] = useState<TaskFormValues>({ title: task?.title ?? "", description: task?.description ?? "",
    columnId: task?.columnId ?? defaultColumnId ?? columns[0]?.id ?? "", assigneeId: task?.assignee?.id ?? "",
    priority: task?.priority ?? "MEDIUM", dueDate: task?.dueDate?.slice(0, 10) ?? "", labelIds: task?.labels.map((l) => l.id) ?? [] });
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => setValues((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    function keydown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
      if (e.key === "Tab") {
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose, saving]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await onSave(values); } catch (err) { setError(err instanceof Error ? err.message : "Unable to save"); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="task-heading" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 id="task-heading" className="text-lg font-semibold">{mode === "create" ? "New task" : "Task details"}</h2><button className="btn" disabled={saving} onClick={onClose}>Close</button></div>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {error && <p role="alert" className="error">{error}</p>}
        <label className="block text-sm">Title<input className="field mt-1" autoFocus required maxLength={200} value={values.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className="block text-sm">Description<textarea className="field mt-1" rows={3} maxLength={2000} value={values.description} onChange={(e) => set("description", e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Status<select className="field mt-1" value={values.columnId} onChange={(e) => set("columnId", e.target.value)}>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm">Assignee<select className="field mt-1" value={values.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}><option value="">Unassigned</option>{members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select></label>
          <label className="text-sm">Priority<select className="field mt-1" value={values.priority} onChange={(e) => set("priority", e.target.value as Priority)}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Due date<input className="field mt-1" type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
        </div>
        {labels.length > 0 && <fieldset><legend className="text-sm">Labels</legend><div className="mt-2 flex flex-wrap gap-3">{labels.map((label) => <label key={label.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={values.labelIds.includes(label.id)} onChange={(e) => set("labelIds", e.target.checked ? [...values.labelIds, label.id] : values.labelIds.filter((id) => id !== label.id))} /><span className="h-2 w-2 rounded-full" style={{ background: label.color }} />{label.name}</label>)}</div></fieldset>}
        <div className="flex justify-between gap-2">
          {onDelete ? <button type="button" className="btn-danger" disabled={saving} onClick={() => { if (confirm("Delete this task, its subtasks, comments, and attachments?")) void onDelete(); }}>Delete task</button> : <span />}
          <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}</button>
        </div>
      </form>
      {task && <TaskExtras taskId={task.id} owner={owner} onChanged={onChanged} />}
    </div>
  </div>;
}
