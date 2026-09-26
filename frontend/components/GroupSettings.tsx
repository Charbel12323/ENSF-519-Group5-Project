"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GroupDetail } from "@/lib/types";
export default function GroupSettings({ group, busy, act }: { group: GroupDetail; busy: boolean; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [column, setColumn] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const base = `/api/groups/${group.id}`;
  function rename(e: FormEvent) { e.preventDefault(); void act(() => api.patch(base, { name })); }
  function addColumn(e: FormEvent) { e.preventDefault(); void act(async () => { await api.post(`${base}/columns`, { name: column }); setColumn(""); }); }
  function addLabel(e: FormEvent) { e.preventDefault(); void act(async () => { await api.post(`${base}/labels`, { name: label, color }); setLabel(""); }); }
  function move(index: number, delta: number) { const ids = group.columns.map((c) => c.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; void act(() => api.put(`${base}/columns/order`, { columnIds: ids })); }
  return <>
    <section className="panel"><h2 className="font-semibold">Group name</h2><form className="mt-3 flex gap-2" onSubmit={rename}><input className="field" aria-label="Group name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" disabled={busy}>Save name</button></form></section>
    <section className="panel"><h2 className="font-semibold">Board columns</h2><p className="mt-1 text-xs text-slate-500">Move columns with the arrows. When deleting a column, its tasks move to the selected destination.</p>
      <ul className="mt-3 divide-y">{group.columns.map((c, index) => <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
        <span className="min-w-24 flex-1 text-sm font-medium">{c.name}</span>
        <button className="btn" aria-label={`Move ${c.name} left`} disabled={busy || index === 0} onClick={() => move(index, -1)}>←</button>
        <button className="btn" aria-label={`Move ${c.name} right`} disabled={busy || index === group.columns.length - 1} onClick={() => move(index, 1)}>→</button>
        <button className="btn" disabled={busy} onClick={() => { const name = prompt("Column name", c.name); if (name?.trim()) void act(() => api.patch(`${base}/columns/${c.id}`, { name })); }}>Rename</button>
        {group.columns.length > 1 && <><select className="field w-auto max-w-44" aria-label={`Move tasks from ${c.name} to`} value={destinations[c.id] ?? group.columns.find((other) => other.id !== c.id)?.id} onChange={(e) => setDestinations((old) => ({ ...old, [c.id]: e.target.value }))}>{group.columns.filter((other) => other.id !== c.id).map((other) => <option value={other.id} key={other.id}>Move to {other.name}</option>)}</select>
          <button className="btn-danger" disabled={busy} onClick={() => { if (confirm(`Delete ${c.name} and move its tasks to the selected column?`)) void act(() => api.delete(`${base}/columns/${c.id}`, { moveToColumnId: destinations[c.id] ?? group.columns.find((other) => other.id !== c.id)?.id })); }}>Delete</button></>}
      </li>)}</ul>
      <form className="mt-3 flex gap-2" onSubmit={addColumn}><input className="field" aria-label="New column name" placeholder="New column name" required maxLength={100} value={column} onChange={(e) => setColumn(e.target.value)} /><button className="btn" disabled={busy}>Add column</button></form>
    </section>
    <section className="panel"><h2 className="font-semibold">Labels</h2><ul className="mt-3 space-y-2">{group.labels.map((l) => <li key={l.id} className="flex items-center gap-2 text-sm"><input aria-label={`Color for ${l.name}`} type="color" value={l.color} disabled={busy} onChange={(e) => void act(() => api.patch(`${base}/labels/${l.id}`, { name: l.name, color: e.target.value }))} /><span className="flex-1">{l.name}</span><button className="btn" disabled={busy} onClick={() => { const name = prompt("Label name", l.name); if (name?.trim()) void act(() => api.patch(`${base}/labels/${l.id}`, { name, color: l.color })); }}>Rename</button><button className="btn-danger" disabled={busy} onClick={() => { if (confirm(`Delete label ${l.name} from all tasks?`)) void act(() => api.delete(`${base}/labels/${l.id}`)); }}>Delete</button></li>)}</ul>
      <form className="mt-3 flex items-center gap-2" onSubmit={addLabel}><input aria-label="New label color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /><input className="field" aria-label="New label name" placeholder="New label name" required maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} /><button className="btn" disabled={busy}>Add label</button></form>
    </section>
    <section className="panel border-red-200"><h2 className="font-semibold text-red-700">Delete group</h2><p className="my-3 text-sm text-slate-500">Permanently deletes this group, its tasks, comments, attachments, and history.</p><button className="btn-danger" disabled={busy} onClick={() => { if (prompt(`Type "${group.name}" to permanently delete this group`) === group.name) void act(async () => { await api.delete(base); router.push("/dashboard"); }); }}>Delete group</button></section>
  </>;
}
