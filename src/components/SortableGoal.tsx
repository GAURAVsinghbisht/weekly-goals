import React, { useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import type { Goal } from "../lib/core";

type Props = {
  goal: Goal;
  onTogglePicked: () => void;
  onToggleCompleted: () => void;

  onRename?: (newTitle: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;

  disabledDrag: boolean;
  disabledPick: boolean;
  disabledComplete: boolean;
  disabledRename?: boolean;
  disabledManage?: boolean;

  // daily tracking
  onToggleTrackDaily?: () => void;
  onToggleDay?: (index: number) => void;
  disableDayChecks?: boolean;
};

export default function SortableGoal(props: Props) {
  const {
    goal,
    onTogglePicked,
    onToggleCompleted,
    onRename,
    onDuplicate,
    onDelete,
    disabledDrag,
    disabledPick,
    disabledComplete,
    disabledRename,
    disabledManage,
    onToggleTrackDaily,
    onToggleDay,
    disableDayChecks,
  } = props;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: goal.id, disabled: disabledDrag });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const daily = useMemo<boolean[]>(() => {
    const arr =
      goal.daily && goal.daily.length === 7
        ? goal.daily
        : new Array(7).fill(false);
    return arr;
  }, [goal.daily]);

  // inline edit state
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(goal.title);
  // kebab menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  // keep draft in sync if goal title changes while not editing
  React.useEffect(() => {
    if (!editing) setDraftTitle(goal.title);
  }, [goal.title, editing]);

  const startEdit = () => {
    if (disabledRename) return;
    setDraftTitle(goal.title);
    setEditing(true);
  };

  const commitEdit = () => {
    const t = draftTitle.trim();
    setEditing(false);
    if (t && t !== goal.title) onRename?.(t);
    else setDraftTitle(goal.title); // revert if empty/unchanged
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftTitle(goal.title);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm ${
        disabledDrag ? "" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* drag handle */}
        <button
          className={`mt-0.5 rounded-xl border border-neutral-200 p-2 ${
            disabledDrag
              ? "cursor-not-allowed opacity-50"
              : "cursor-grab active:cursor-grabbing"
          }`}
          {...(!disabledDrag ? { ...attributes, ...listeners } : {})}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 opacity-60" />
        </button>

        <div className="flex-1">
          {/* Title + edit + kebab */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {editing ? (
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                />
              ) : (
                <div className="min-w-0 truncate text-sm font-medium text-neutral-800">
                  {goal.title}
                </div>
              )}
            </div>
            <div className="relative flex items-center gap-1">
              {/* Edit pencil — always visible */}
              {onRename && (
                <button
                  className={`rounded-lg p-1 hover:bg-neutral-100 ${
                    disabledRename ? "cursor-not-allowed opacity-50" : ""
                  }`}
                  onClick={startEdit}
                  title="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}

              {/* 3-dots kebab menu */}
              {(onDuplicate || onDelete) && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className={`rounded-lg p-1 hover:bg-neutral-100 ${
                      disabledManage ? "cursor-not-allowed opacity-50" : ""
                    }`}
                    disabled={disabledManage}
                    title="More"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuOpen && !disabledManage && (
                    <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 text-sm shadow-lg">
                      {onDuplicate && (
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50"
                          onClick={() => {
                            setMenuOpen(false);
                            onDuplicate?.();
                          }}
                        >
                          <Copy className="h-4 w-4" /> Duplicate
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50/60"
                          onClick={() => {
                            setMenuOpen(false);
                            onDelete?.();
                          }}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* picked / completed */}
          <div className="mt-1 flex items-center gap-4 text-[12px] text-neutral-600">
            <label
              className={`inline-flex items-center gap-2 ${
                disabledPick ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                className="accent-black h-5 w-5"
                checked={!!goal.picked}
                onChange={onTogglePicked}
                disabled={disabledPick}
              />
              <span>picked</span>
            </label>

            <label
              className={`inline-flex items-center gap-2 ${
                disabledComplete ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                className="accent-green-600 h-5 w-5"
                checked={!!goal.completed}
                onChange={onToggleCompleted}
                disabled={disabledComplete}
              />
              <span>completed</span>
            </label>

            {/* iOS-style green toggle CHIP + label on the RIGHT */}
            {onToggleTrackDaily && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={!!goal.trackDaily}
                  onClick={onToggleTrackDaily}
                  disabled={disabledManage}
                  className={`relative h-6 w-11 rounded-full transition ${
                    goal.trackDaily ? "bg-emerald-500" : "bg-neutral-300"
                  } ${
                    disabledManage
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:brightness-95"
                  }`}
                  title="Track daily"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      goal.trackDaily ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-[12px] text-neutral-700">
                  Track daily
                </span>
              </div>
            )}
          </div>

          {/* 7 radio-like dots with check inside */}
          {goal.trackDaily && onToggleDay && (
            <div className="mt-2 flex items-center gap-2">
              {daily.map((on, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onToggleDay(idx)}
                  disabled={disableDayChecks}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                    on
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-neutral-300 bg-white text-transparent"
                  } ${
                    disableDayChecks
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:brightness-95"
                  }`}
                  aria-pressed={on}
                  aria-label={`Day ${idx + 1}`}
                >
                  <Check className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        {goal.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : null}
      </div>
    </div>
  );
}
