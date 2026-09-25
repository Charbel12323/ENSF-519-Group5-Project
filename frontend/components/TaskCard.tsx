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
}: {
  task: Task;
  index: number;
  onClick: () => void;
}) {
  return (
    <Draggable draggableId={task.id} index={index}>
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
