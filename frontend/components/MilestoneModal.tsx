"use client";
import { FormEvent, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/auth-context";
import { Milestone } from "@/lib/types";

export interface MilestoneValues { title: string; description: string; dueDate: string }

export default function MilestoneModal({ milestone, defaultDate, saving, onClose, onSave, onDelete }: {
  milestone?: Milestone; defaultDate?: string; saving: boolean; onClose: () => void;
  onSave: (values: MilestoneValues) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<MilestoneValues>({ title: milestone?.title ?? "", description: milestone?.description ?? "", dueDate: milestone?.dueDate.slice(0, 10) ?? defaultDate ?? "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose, saving]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await onSave(values); } catch (err) { setError(getErrorMessage(err)); }
  }
  return <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="milestone-heading" className="animate-pop-in w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 id="milestone-heading" className="text-lg font-semibold">{milestone ? "Edit milestone" : "New milestone"}</h2><button className="btn" disabled={saving} onClick={onClose}>Close</button></div>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {error && <p role="alert" className="error">{error}</p>}
        <label className="block text-sm">Title<input className="field mt-1" autoFocus required maxLength={200} value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} /></label>
        <label className="block text-sm">Date<input className="field mt-1" type="date" required value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} /></label>
        <label className="block text-sm">Description <span className="text-slate-400">(optional)</span><textarea className="field mt-1" rows={3} maxLength={2000} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} /></label>
        <div className="flex justify-between gap-2">
          {onDelete ? <button type="button" className="btn-danger" disabled={saving} onClick={() => { if (confirm("Delete this milestone?")) void onDelete().catch((err) => setError(getErrorMessage(err))); }}>Delete</button> : <span />}
          <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : milestone ? "Save changes" : "Create milestone"}</button>
        </div>
      </form>
    </div>
  </div>;
}
