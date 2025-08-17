
import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, MoreVertical, Copy, Trash2, CheckCircle2 } from "lucide-react";
import type { Goal } from "../lib/core";

export default function SortableGoal({ goal, onTogglePicked, onToggleCompleted, onRename, onDuplicate, onDelete, disabledDrag, disabledPick, disabledComplete, disabledRename, disabledManage }: { goal: Goal; onTogglePicked: () => void; onToggleCompleted: () => void; onRename: (newTitle: string) => void; onDuplicate: () => void; onDelete: () => void; disabledDrag: boolean; disabledPick: boolean; disabledComplete: boolean; disabledRename: boolean; disabledManage: boolean; }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: goal.id, disabled: disabledDrag });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(goal.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const commitRename = () => {
    const v = temp.trim();
    if (v && v !== goal.title) onRename(v);
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm ${disabledDrag ? "" : "hover:shadow-md"}`}>
      <button className={`rounded-xl border border-neutral-200 p-2 ${disabledDrag ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"}`} {...(!disabledDrag ? { ...attributes, ...listeners } : {})} aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4 opacity-60" />
      </button>
      <div className="flex-1">
        {editing ? (
          <input
            autoFocus
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setTemp(goal.title); setEditing(false); } }}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-neutral-800">{goal.title}</div>
            <div className="relative flex items-center gap-1">
              <button
                className={`rounded-lg px-2 py-1 text-[11px] ${disabledRename ? 'cursor-not-allowed opacity-40' : 'hover:bg-neutral-100'}`}
                onClick={() => { if (!disabledRename) { setTemp(goal.title); setEditing(true); } }}
                title={disabledRename ? 'Cannot rename in past weeks' : 'Rename goal'}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <div
                className="relative"
                tabIndex={0}
                onBlur={(e) => {
                  const next = e.relatedTarget as Node | null;
                  if (!next || !e.currentTarget.contains(next)) setMenuOpen(false);
                }}
              >
                <button
                  className={`rounded-lg px-2 py-1 text-[11px] ${disabledManage ? 'cursor-not-allowed opacity-40' : 'hover:bg-neutral-100'}`}
                  onClick={() => { if (!disabledManage) setMenuOpen(v => !v); }}
                  title={disabledManage ? 'Actions disabled in past weeks' : 'More actions'}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 text-sm shadow-xl">
                    <button
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 ${disabledManage ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={disabledManage}
                      type="button"
                      onMouseDown={() => { setMenuOpen(false); onDuplicate(); }}
                    >
                      <Copy className="h-4 w-4"/> Duplicate
                    </button>
                    <button
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 ${disabledManage ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={disabledManage}
                      type="button"
                      onMouseDown={() => { setMenuOpen(false); onDelete(); }}
                    >
                      <Trash2 className="h-4 w-4"/> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="mt-1 flex items-center gap-4 text-[12px] text-neutral-600">
          <label className={`inline-flex items-center gap-2 ${disabledPick ? "opacity-50" : ""}`}>
            <input type="checkbox" className="accent-black h-5 w-5" checked={goal.picked} onChange={onTogglePicked} disabled={disabledPick} />
            <span>picked</span>
          </label>
          <label className={`inline-flex items-center gap-2 ${disabledComplete ? "opacity-50" : ""}`}>
            <input type="checkbox" className="accent-green-600 h-5 w-5" checked={goal.completed} onChange={onToggleCompleted} disabled={disabledComplete} />
            <span>completed</span>
          </label>
        </div>
      </div>
      {goal.completed ? (<CheckCircle2 className="h-5 w-5 text-green-600" />) : null}
    </div>
  );
}
