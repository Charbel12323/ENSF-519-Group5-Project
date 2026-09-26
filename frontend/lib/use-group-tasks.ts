"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { getErrorMessage } from "./auth-context";
import { GroupDetail, Milestone, Task } from "./types";
import { useLiveRefresh } from "./use-live-refresh";
import { taskRequestBody, TaskFormValues } from "@/components/TaskModal";
import { MilestoneValues } from "@/components/MilestoneModal";

export type TaskModalState = { mode: "create"; defaults: Partial<TaskFormValues> } | { mode: "edit"; task: Task } | null;

// Shared data layer for the calendar and timeline views: the same group tasks the board
// uses, plus task create/edit/delete through the existing task endpoints.
export function useGroupTasks(groupId: string, { milestones: withMilestones = false } = {}) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<TaskModalState>(null);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [g, t, m] = await Promise.all([
        api.get<{ group: GroupDetail }>(`/api/groups/${groupId}`),
        api.get<{ tasks: Task[] }>(`/api/groups/${groupId}/tasks`),
        withMilestones ? api.get<{ milestones: Milestone[] }>(`/api/groups/${groupId}/milestones`) : Promise.resolve(null),
      ]);
      if (request !== sequence.current) return;
      setGroup(g.group); setTasks(t.tasks); if (m) setMilestones(m.milestones); setError(null);
    } catch (err) { if (request === sequence.current) setError(getErrorMessage(err)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [groupId, withMilestones]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes after network responses.
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(load, saving || !!modal);

  async function run(work: () => Promise<unknown>) {
    setSaving(true); ++sequence.current;
    try { await work(); await load(); } finally { setSaving(false); }
  }
  const save = (values: TaskFormValues) => run(async () => {
    if (modal?.mode === "edit") await api.patch(`/api/tasks/${modal.task.id}`, taskRequestBody(values, "edit"));
    else await api.post(`/api/groups/${groupId}/tasks`, taskRequestBody(values, "create"));
    setModal(null);
  });
  const remove = async () => {
    if (modal?.mode !== "edit") return;
    try { await run(async () => { await api.delete(`/api/tasks/${modal.task.id}`); setModal(null); }); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  /** Reschedule a task (used by calendar and timeline drag). Optimistic, reverted by reload on failure. */
  const reschedule = async (task: Task, dates: { startDate: string | null; dueDate: string | null }) => {
    setTasks((all) => all.map((t) => (t.id === task.id ? { ...t, ...dates } : t)));
    setError(null);
    try { await run(() => api.patch(`/api/tasks/${task.id}`, dates)); }
    catch (err) { setError(getErrorMessage(err)); await load(); }
  };

  const saveMilestone = (id: string | undefined, values: MilestoneValues) => {
    const body = { ...values, description: values.description || null };
    return run(() => id ? api.patch(`/api/groups/${groupId}/milestones/${id}`, body) : api.post(`/api/groups/${groupId}/milestones`, body));
  };
  const deleteMilestone = (id: string) => run(() => api.delete(`/api/groups/${groupId}/milestones/${id}`));

  return { group, tasks, milestones, loading, error, setError, modal, setModal, saving, load, save, remove, reschedule, saveMilestone, deleteMilestone };
}
