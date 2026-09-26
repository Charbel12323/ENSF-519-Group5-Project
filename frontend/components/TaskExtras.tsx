"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, getErrorMessage } from "@/lib/auth-context";
import { TaskDetail } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-live-refresh";

export default function TaskExtras({ taskId, owner, onChanged }: { taskId: string; owner: boolean; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [subtask, setSubtask] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/tasks/${taskId}`;
  const load = useCallback(async () => {
    try { setDetail((await api.get<{ task: TaskDetail }>(`/api/tasks/${taskId}`)).task); }
    catch (err) { setError(getErrorMessage(err)); }
  }, [taskId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes after network responses.
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load, busy);
  async function act(work: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await work(); await load(); await onChanged(); } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  }
  function addSubtask(e: FormEvent) { e.preventDefault(); void act(async () => { await api.post(`${base}/subtasks`, { title: subtask }); setSubtask(""); }); }
  function addComment(e: FormEvent) { e.preventDefault(); void act(async () => { await api.post(`${base}/comments`, { body: comment }); setComment(""); }); }
  return <div className="mt-6 space-y-6 border-t pt-5">
    {error && <p className="error" role="alert">{error}</p>}
    {!detail ? <p className="text-sm text-slate-500">Loading task conversation…</p> : <>
      <section><h3 className="font-semibold">Subtasks <span className="text-sm font-normal text-slate-500">{detail.subtasks.filter((s) => s.completed).length}/{detail.subtasks.length}</span></h3>
        <ul className="my-3 space-y-2">{detail.subtasks.map((s) => <li key={s.id} className="flex items-center gap-2 text-sm">
          <input aria-label={`Complete ${s.title}`} type="checkbox" checked={s.completed} disabled={busy} onChange={(e) => void act(() => api.patch(`${base}/subtasks/${s.id}`, { completed: e.target.checked }))} />
          <span className={`flex-1 ${s.completed ? "text-slate-400 line-through" : ""}`}>{s.title}</span>
          <button className="text-brand-600" disabled={busy} onClick={() => { const title = prompt("Subtask title", s.title); if (title?.trim()) void act(() => api.patch(`${base}/subtasks/${s.id}`, { title })); }}>Edit</button>
          <button className="text-red-600" disabled={busy} onClick={() => void act(() => api.delete(`${base}/subtasks/${s.id}`))}>Remove</button>
        </li>)}</ul>
        <form className="flex gap-2" onSubmit={addSubtask}><input className="field" aria-label="New subtask" placeholder="Add a subtask" required maxLength={200} value={subtask} onChange={(e) => setSubtask(e.target.value)} /><button className="btn" disabled={busy}>Add</button></form>
      </section>
      <section><h3 className="font-semibold">Attachments</h3><p className="mt-1 text-xs text-slate-500">Up to 20 files, 5 MB each.</p>
        <ul className="my-3 space-y-2">{detail.attachments.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
          <button className="truncate text-brand-600 underline" onClick={() => void act(() => api.download(`${base}/attachments/${a.id}`, a.name))}>{a.name} ({Math.ceil(a.size / 1024)} KB)</button>
          {(owner || a.uploaderId === user?.id) && <button className="text-red-600" disabled={busy} onClick={() => { if (confirm(`Remove ${a.name}?`)) void act(() => api.delete(`${base}/attachments/${a.id}`)); }}>Remove</button>}
        </li>)}</ul>
        <input aria-label="Upload attachment" type="file" disabled={busy} className="block w-full text-sm" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          if (file.size > 5 * 1024 * 1024) { setError("Maximum file size is 5 MB"); return; }
          void act(() => api.upload(`${base}/attachments`, file));
        }} />
      </section>
      <section><h3 className="font-semibold">Comments</h3>
        <div className="my-3 space-y-3">{detail.comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}{detail.comments.map((c) => <article key={c.id} className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500"><strong>{c.author.name}</strong> · {new Date(c.createdAt).toLocaleString()}{c.updatedAt !== c.createdAt ? " · edited" : ""}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
          <div className="mt-2 flex gap-3 text-xs">
            {c.authorId === user?.id && <button className="text-brand-600" disabled={busy} onClick={() => { const body = prompt("Edit comment", c.body); if (body?.trim()) void act(() => api.patch(`${base}/comments/${c.id}`, { body })); }}>Edit</button>}
            {(owner || c.authorId === user?.id) && <button className="text-red-600" disabled={busy} onClick={() => { if (confirm("Delete this comment?")) void act(() => api.delete(`${base}/comments/${c.id}`)); }}>Delete</button>}
          </div>
        </article>)}</div>
        <form className="space-y-2" onSubmit={addComment}><textarea className="field" aria-label="New comment" placeholder="Write a comment" required rows={2} maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} /><button className="btn" disabled={busy}>Post comment</button></form>
      </section>
      <section><h3 className="font-semibold">Activity</h3><ol className="mt-3 space-y-2 text-xs text-slate-500">{detail.activity.map((a) => <li key={a.id}><strong>{a.actor.name}</strong> {a.message} <span>· {new Date(a.createdAt).toLocaleString()}</span></li>)}</ol>{detail.activity.length === 100 && <p className="mt-2 text-xs text-slate-500">Showing the latest 100 events. The full group history is on the Members & settings page.</p>}</section>
    </>}
  </div>;
}
