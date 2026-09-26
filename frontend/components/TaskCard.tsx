"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Task } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TaskCard({
  task,
  index,
  onClick,
  disabled = false,
}: {
  task: Task;
  index: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={disabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`mb-2 cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow-md ${
            snapshot.isDragging ? "rotate-1 ring-2 ring-brand-300" : ""
          }`}
        >
          <p className="text-sm font-medium text-slate-800">{task.title}</p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            <span className={`rounded px-1.5 py-0.5 ${task.priority === "URGENT" || task.priority === "HIGH" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{task.priority}</span>
            {task.labels.map((label) => <span key={label.id} className="rounded border px-1.5 py-0.5" style={{ borderColor: label.color }}>{label.name}</span>)}
          </div>
          {task.dueDate && <p className={`mt-2 text-xs ${task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-slate-500"}`}>Due {task.dueDate.slice(0, 10)}</p>}
          <p className="mt-2 text-xs text-slate-400">{task.subtasks.length > 0 && `${task.subtasks.filter((s) => s.completed).length}/${task.subtasks.length} subtasks · `}{task._count.comments} comments · {task._count.attachments} files</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {new Date(task.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            {task.assignee ? (
              <span
                title={task.assignee.name}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700"
              >
                {initials(task.assignee.name)}
              </span>
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400">
                ?
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
