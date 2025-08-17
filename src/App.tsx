import React, { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, CheckCircle2, GripVertical, PartyPopper, Lock, CalendarClock, Trophy, Rocket, Sparkles, Plus, Pencil, MoreVertical, Copy, Trash2 } from "lucide-react";
// Firebase (Option 2: Client SDK)
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// ============================
// Types
// ============================
export type Goal = { id: string; title: string; picked: boolean; completed: boolean };
export type Category = { id: string; name: string; goals: Goal[] };
export type Profile = {
  name: string;
  age?: number | "";
  sex?: "Male" | "Female" | "Other" | "";
  email?: string;
  bloodGroup?: string;
  maritalStatus?: "Single" | "Married" | "Other" | "";
  occupation?: "Job" | "Business" | "Student" | "Other" | "";
  photoUrl?: string;
};

// ============================
// Utilities
// ============================
function uid() { return Math.random().toString(36).slice(2, 9); }

function startOfWeekKolkata(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);
  const wd = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "Asia/Kolkata" }).format(date);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[wd as keyof typeof map] ?? 0;
  const local = new Date(Date.UTC(y, m - 1, d));
  local.setUTCDate(local.getUTCDate() - offset);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function fmtDateUTCYYYYMMDD(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ============================
// Theming
// ============================
const PALETTES: Record<string, { col: string; chip: string; border: string; heading: string; }> = {
  health:    { col: "bg-gradient-to-br from-emerald-100 to-emerald-200", chip: "bg-emerald-600 text-white", border:"border-emerald-300", heading:"text-emerald-900" },
  learning:  { col: "bg-gradient-to-br from-sky-100 to-indigo-200",     chip: "bg-indigo-600 text-white",  border:"border-indigo-300", heading:"text-indigo-900" },
  career:    { col: "bg-gradient-to-br from-amber-100 to-orange-200",   chip: "bg-amber-600 text-white",   border:"border-amber-300", heading:"text-amber-900" },
  relation:  { col: "bg-gradient-to-br from-rose-100 to-pink-200",      chip: "bg-rose-600 text-white",    border:"border-rose-300", heading:"text-rose-900" },
  finance:   { col: "bg-gradient-to-br from-teal-100 to-emerald-200",   chip: "bg-teal-600 text-white",    border:"border-teal-300", heading:"text-teal-900" },
  fun:       { col: "bg-gradient-to-br from-violet-100 to-fuchsia-200", chip: "bg-fuchsia-600 text-white", border:"border-fuchsia-300", heading:"text-fuchsia-900" },
};
function paletteFor(name: string) {
  const key = name.toLowerCase();
  if (key.includes("health") || key.includes("energy")) return PALETTES.health;
  if (key.includes("learn") || key.includes("growth")) return PALETTES.learning;
  if (key.includes("career") || key.includes("craft")) return PALETTES.career;
  if (key.includes("relation")) return PALETTES.relation;
  if (key.includes("finance") || key.includes("money")) return PALETTES.finance;
  return PALETTES.fun;
}

// ============================
// Default Data
// ============================
const DEFAULT_DATA: Category[] = [
  { id: uid(), name: "Health & Energy", goals: [
    { id: uid(), title: "30‑min workout", picked: false, completed: false },
    { id: uid(), title: "Sleep 7+ hours", picked: false, completed: false },
    { id: uid(), title: "10k steps", picked: false, completed: false },
    { id: uid(), title: "Meditate 10 min", picked: false, completed: false },
  ]},
  { id: uid(), name: "Learning & Growth", goals: [
    { id: uid(), title: "Read 20 pages", picked: false, completed: false },
    { id: uid(), title: "Course lesson", picked: false, completed: false },
    { id: uid(), title: "Write notes", picked: false, completed: false },
  ]},
  { id: uid(), name: "Career & Craft", goals: [
    { id: uid(), title: "Deep work (90m)", picked: false, completed: false },
    { id: uid(), title: "Ship a task", picked: false, completed: false },
    { id: uid(), title: "Mentor someone", picked: false, completed: false },
  ]},
  { id: uid(), name: "Relationships", goals: [
    { id: uid(), title: "Quality time", picked: false, completed: false },
    { id: uid(), title: "Call a friend", picked: false, completed: false },
    { id: uid(), title: "Acts of kindness", picked: false, completed: false },
  ]},
  { id: uid(), name: "Finance", goals: [
    { id: uid(), title: "Track expenses", picked: false, completed: false },
    { id: uid(), title: "No‑spend day", picked: false, completed: false },
    { id: uid(), title: "Invest/Plan", picked: false, completed: false },
  ]},
  { id: uid(), name: "Fun & Spirit", goals: [
    { id: uid(), title: "Hobby session", picked: false, completed: false },
    { id: uid(), title: "Get outdoors", picked: false, completed: false },
    { id: uid(), title: "Gratitude journal", picked: false, completed: false },
  ]},
];

// ============================
// UI Primitives
// ============================
function Toast({ show, title, subtitle, onClose }: { show: boolean; title: string; subtitle?: string; onClose: () => void; }) {
  useEffect(() => { if (!show) return; const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [show, onClose]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-fuchsia-500 p-4 text-white shadow-2xl">
            <PartyPopper className="mt-0.5 h-6 w-6" />
            <div>
              <div className="text-sm font-semibold">{title}</div>
              {subtitle && <div className="text-xs opacity-90">{subtitle}</div>}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConfirmDialog({ open, title, description, confirmText = "Delete", cancelText = "Cancel", onConfirm, onCancel }: { open: boolean; title: string; description?: string; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 bg-gradient-to-r from-rose-600 to-pink-500 px-4 py-3 text-white">
              <div className="rounded-xl bg-white/20 p-2"><Trash2 className="h-5 w-5"/></div>
              <div className="text-sm font-semibold">{title}</div>
            </div>
            <div className="p-4 text-sm text-neutral-700">
              {description && <p>{description}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 bg-neutral-50 px-4 py-3">
              <button onClick={onCancel} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100">{cancelText}</button>
              <button onClick={onConfirm} className="rounded-xl bg-rose-600 px-3 py-2 text-sm text-white shadow hover:bg-rose-700">{confirmText}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MilestoneCard({ level, active, label, desc }: { level: "right" | "rocking" | "brilliant"; active: boolean; label: string; desc: string; }) {
  const palette = level === "brilliant" ? "bg-gradient-to-tr from-emerald-500 to-lime-500" : level === "rocking" ? "bg-gradient-to-tr from-indigo-500 to-fuchsia-500" : "bg-gradient-to-tr from-amber-500 to-orange-500";
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-neutral-200 p-4 shadow-sm ${active ? palette + " text-white" : "bg-white"}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-2xl ${active ? "bg-white/15" : "bg-neutral-100"} p-2`}>{active ? <CheckCircle2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-neutral-400" />}</div>
        <div>
          <div className={`text-sm font-semibold ${active ? "" : "text-neutral-800"}`}>{label}</div>
          <div className={`text-xs ${active ? "opacity-90" : "text-neutral-500"}`}>{desc}</div>
        </div>
      </div>
      {active && (<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 10 }} className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20" />)}
    </div>
  );
}

// ============================
// Firebase init (client)
// ============================
const FIREBASE_CONFIG = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "",
};

const hasFirebaseConfig = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let _fbApp: any; let db: any; let storage: any;
function ensureFirebase() {
  if (!_fbApp && hasFirebaseConfig()) {
    try {
      _fbApp = initializeApp(FIREBASE_CONFIG);
      db = getFirestore(_fbApp);
      storage = getStorage(_fbApp);
    } catch (e) {
      console.warn("Firebase init failed", e);
    }
  }
  return { db, storage };
}

// Helpers to clone default data (fresh ids, reset flags)
function freshWeekTemplate(): Category[] {
  return DEFAULT_DATA.map(c => ({ ...c, id: uid(), goals: c.goals.map(g => ({ ...g, id: uid(), picked: false, completed: false })) }));
}

async function loadWeekData(profileId: string, weekStamp: string): Promise<Category[]> {
  const { db } = ensureFirebase();
  if (db) {
    try {
      const snap = await getDoc(doc(db, "weeklyGoals", `${profileId}_${weekStamp}`));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (Array.isArray(data.categories)) return data.categories as Category[];
      }
    } catch (e) { console.warn("loadWeekData firestore", e); }
  }
  // Fallback to localStorage
  const local = localStorage.getItem(`goal-challenge:${weekStamp}`);
  if (local) { try { return JSON.parse(local) as Category[]; } catch {} }
  return freshWeekTemplate();
}

async function saveWeekData(profileId: string, weekStamp: string, categories: Category[]) {
  const { db } = ensureFirebase();
  if (db) {
    try {
      await setDoc(
        doc(db, "weeklyGoals", `${profileId}_${weekStamp}`),
        { profileId, weekStamp, categories, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (e) { console.warn("saveWeekData firestore", e); }
  }
  // Always also keep a local cache for offline/read speed
  localStorage.setItem(`goal-challenge:${weekStamp}`, JSON.stringify(categories));
}

// ============================
// Sortable Goal Item
// ============================
function SortableGoal({ goal, onTogglePicked, onToggleCompleted, onRename, onDuplicate, onDelete, disabledDrag, disabledPick, disabledComplete, disabledRename, disabledManage }: { goal: Goal; onTogglePicked: () => void; onToggleCompleted: () => void; onRename: (newTitle: string) => void; onDuplicate: () => void; onDelete: () => void; disabledDrag: boolean; disabledPick: boolean; disabledComplete: boolean; disabledRename: boolean; disabledManage: boolean; }) {
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

// ============================
// Profile Page (Firebase Web SDK)
// ============================
function ProfilePage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: "", age: "", sex: "", email: "", bloodGroup: "", maritalStatus: "", occupation: "", photoUrl: "" });
  const [error, setError] = useState<string | null>(null);

  const profileIdKey = "goal-challenge:profileId";
  const [profileId] = useState<string>(() => {
    const existing = localStorage.getItem(profileIdKey);
    if (existing) return existing;
    const id = uid();
    localStorage.setItem(profileIdKey, id);
    return id;
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { db } = ensureFirebase();
        if (db) {
          const snap = await getDoc(doc(db, "profiles", profileId));
          if (snap.exists()) {
            const data = snap.data() as Profile;
            setProfile({
              name: data.name || "",
              age: (data.age as number) ?? "",
              sex: (data.sex as any) ?? "",
              email: data.email || "",
              bloodGroup: data.bloodGroup || "",
              maritalStatus: (data.maritalStatus as any) ?? "",
              occupation: (data.occupation as any) ?? "",
              photoUrl: data.photoUrl || "",
            });
            if (data.photoUrl) setPreview(data.photoUrl);
          }
        }
      } catch (e: any) {
        console.error(e);
        setError("Failed to load profile. Check Firebase config.");
      } finally { setLoading(false); }
    })();
  }, [profileId]);

  const onFile = (f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else { setPreview(null); }
  };

  const save = async () => {
    setError(null);
    if (!profile.name) { setError("Name is required"); return; }
    try {
      setSaving(true);
      const { db, storage } = ensureFirebase();
      let photoUrl = profile.photoUrl || "";
      if (photoFile && storage) {
        const blob = await photoFile.arrayBuffer();
        const ref = storageRef(storage, `profiles/${profileId}`);
        await uploadBytes(ref, new Blob([blob], { type: photoFile.type || "image/jpeg" }));
        photoUrl = await getDownloadURL(ref);
      }
      if (db) {
        const payload: Profile = { ...profile, photoUrl };
        await setDoc(doc(db, "profiles", profileId), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to save. Verify Firebase config & rules.");
      return;
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Profile</h2>
          <span className="text-xs text-neutral-500">Profile ID: <span className="font-mono">{profileId}</span></span>
        </div>

        {error && <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {loading ? <div className="text-sm text-neutral-500">Loading…</div> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">Name
              <input className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="text-sm">Age
              <input type="number" min={0} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.age as any} onChange={e => setProfile(p => ({ ...p, age: e.target.value === "" ? "" : Number(e.target.value) }))} />
            </label>
            <label className="text-sm">Sex
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.sex as any} onChange={e => setProfile(p => ({ ...p, sex: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">Email
              <input type="email" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.email || ""} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="text-sm">Blood Group
              <input className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" placeholder="e.g., O+" value={profile.bloodGroup || ""} onChange={e => setProfile(p => ({ ...p, bloodGroup: e.target.value }))} />
            </label>
            <label className="text-sm">Marital Status
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.maritalStatus as any} onChange={e => setProfile(p => ({ ...p, maritalStatus: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Other</option>
              </select>
            </label>
            <label className="text-sm">Occupation
              <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white p-2" value={profile.occupation as any} onChange={e => setProfile(p => ({ ...p, occupation: e.target.value as any }))}>
                <option value="">Select</option>
                <option>Job</option>
                <option>Business</option>
                <option>Student</option>
                <option>Other</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} disabled={saving} className="rounded-xl bg-black px-4 py-2 text-sm text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save to Firebase"}</button>
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Profile Photo</div>
        {preview ? (
          <img src={preview} alt="Preview" className="mb-3 aspect-square w-full rounded-2xl object-cover" />
        ) : (
          <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-2xl bg-neutral-100 text-xs text-neutral-500">No photo</div>
        )}
        <input type="file" accept="image/*" onChange={e => onFile(e.target.files?.[0] || null)} className="w-full text-sm" />
        <p className="mt-2 text-xs text-neutral-500">Uploaded to Firebase Storage on save.</p>
      </div>
    </div>
  );
}

// ============================
// Main App
// ============================
export default function GoalChallengeApp() {
  const [tab, setTab] = useState<"goals" | "profile">("goals");

  // Profile id (used to scope per-user weekly docs)
  const profileIdKey = "goal-challenge:profileId";
  const [profileId] = useState<string>(() => {
    const ex = localStorage.getItem(profileIdKey);
    if (ex) return ex;
    const id = uid();
    localStorage.setItem(profileIdKey, id);
    return id;
  });

  // Week handling
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekKolkata());
  const weekStamp = useMemo(() => fmtDateUTCYYYYMMDD(weekStart), [weekStart]);
  const currentWeekStart = useMemo(() => startOfWeekKolkata(), []);
  const isPast = weekStart.getTime() < currentWeekStart.getTime();
  const isFuture = weekStart.getTime() > currentWeekStart.getTime();

  // Week data state (per-week persistence) — start empty to avoid saving wrong week on first render
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const hydratingRef = useRef(false);
  const saveTimer = useRef<number | undefined>();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Pretty confirm dialog state & helpers
  const [confirmDel, setConfirmDel] = useState<{ open: boolean; catId?: string; goalId?: string; title?: string }>({ open: false });
  const requestDelete = (catId: string, goalId: string, title: string) => {
    if (isPast) return; // safety
    setConfirmDel({ open: true, catId, goalId, title });
  };
  const confirmDelete = () => {
    if (confirmDel.catId && confirmDel.goalId) deleteGoal(confirmDel.catId, confirmDel.goalId);
    setConfirmDel({ open: false });
  };

  // Add/Rename helpers and input state
  const [newGoalText, setNewGoalText] = useState<Record<string, string>>({});
  const addGoal = (catId: string, title: string) => {
    if (isPast) return; // no edits in the past
    if (!title) return;
    setCategories(prev => prev.map(c => c.id !== catId ? c : ({
      ...c,
      goals: [...c.goals, { id: uid(), title, picked: false, completed: false }]
    })));
    setNewGoalText(prev => ({ ...prev, [catId]: '' }));
  };
  const renameGoal = (catId: string, goalId: string, newTitle: string) => {
    if (isPast) return; // no edits in the past
    setCategories(prev => prev.map(c => c.id !== catId ? c : ({
      ...c,
      goals: c.goals.map(g => g.id !== goalId ? g : ({ ...g, title: newTitle }))
    })));
  };
  const duplicateGoal = (catId: string, goalId: string) => {
    if (isPast) return; // no edits in the past
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const g = c.goals.find(x => x.id === goalId);
      if (!g) return c;
      return {
        ...c,
        goals: [...c.goals, { id: uid(), title: g.title + " (copy)", picked: false, completed: false }]
      };
    }));
  };
  const deleteGoal = (catId: string, goalId: string) => {
    if (isPast) return; // no edits in the past
    setCategories(prev => prev.map(c => c.id !== catId ? c : ({
      ...c,
      goals: c.goals.filter(g => g.id !== goalId)
    })));
  };

  // Load week from storage/Firestore whenever week changes
  useEffect(() => {
    let alive = true;
    (async () => {
      hydratingRef.current = true;
      setLoadingWeek(true);
      try {
        const data = await loadWeekData(profileId, weekStamp);
        if (!alive) return;
        setCategories(data);
      } finally {
        hydratingRef.current = false;
        setLoadingWeek(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId, weekStamp]);

  // Save week to storage/Firestore when categories change (but not while hydrating)
  useEffect(() => {
    if (hydratingRef.current) return;
    // Debounce saves to reduce writes when dragging/toggling fast
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveWeekData(profileId, weekStamp, categories);
    }, 300);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [categories, profileId, weekStamp]);

  // Stats & Milestones
  const achievedPerCategory = categories.map(c => c.goals.filter(g => g.completed).length >= 2);
  const achievedCount = achievedPerCategory.filter(Boolean).length;
  const milestoneLevel = achievedCount === 6 ? "brilliant" : achievedCount >= 4 ? "rocking" : achievedCount >= 2 ? "right" : "none";
  const prevLevel = useRef<string>("none");
  const [toast, setToast] = useState<{ show: boolean; title: string; subtitle?: string }>({ show: false, title: "", subtitle: "" });
  useEffect(() => {
    if (!isPast && milestoneLevel !== "none" && milestoneLevel !== prevLevel.current) {
      prevLevel.current = milestoneLevel;
      const map = { right: { title: "You're on the right track!", sub: "2 categories done. Keep the momentum!" }, rocking: { title: "You're rocking it!", sub: "2 goals in 4+ categories. Outstanding!" }, brilliant: { title: "Brilliant week!", sub: "2 goals in every category. You're unstoppable!" }, } as const;
      const m = map[milestoneLevel as keyof typeof map];
      setToast({ show: true, title: m.title, subtitle: m.sub });
    }
  }, [milestoneLevel, isPast]);

  // Handlers with time-guard rules
  const onDragEnd = (e: DragEndEvent) => {
    if (isPast) return; // past weeks are read-only
    const { active, over } = e; if (!over || active.id === over.id) return;
    const findCatByGoal = (goalId: string) => categories.find(c => c.goals.some(g => g.id === goalId));
    const srcCat = findCatByGoal(String(active.id)); const dstCat = findCatByGoal(String(over.id));
    if (!srcCat || !dstCat || srcCat.id !== dstCat.id) return;
    const catIdx = categories.findIndex(c => c.id === srcCat.id);
    const srcGoals = srcCat.goals; const oldIndex = srcGoals.findIndex(g => g.id === active.id); const newIndex = srcGoals.findIndex(g => g.id === over.id);
    const newGoals = arrayMove(srcGoals, oldIndex, newIndex);
    const next = [...categories]; next[catIdx] = { ...srcCat, goals: newGoals }; setCategories(next);
  };
  const togglePicked = (catId: string, goalId: string) => { if (isPast) return; setCategories(prev => prev.map(c => c.id !== catId ? c : ({ ...c, goals: c.goals.map(g => g.id !== goalId ? g : ({ ...g, picked: !g.picked })) }))); };
  const toggleCompleted = (catId: string, goalId: string) => {
    // Past weeks: no edits; Future weeks: cannot complete
    if (isPast || isFuture) return;

    // Inspect current state to know if this action is marking as completed
    const cat = categories.find(c => c.id === catId);
    const goal = cat?.goals.find(g => g.id === goalId);
    const willComplete = !!goal && !goal.completed; // only toast on transition -> completed
    const goalTitle = goal?.title || "Goal";
    const catName = cat?.name || "";

    // Flip completion
    setCategories(prev => prev.map(c => c.id !== catId ? c : ({
      ...c,
      goals: c.goals.map(g => g.id !== goalId ? g : ({ ...g, completed: !g.completed }))
    })));

    // Friendly toast for each completion
    if (willComplete) {
      setToast({ show: true, title: "Nice! Task completed", subtitle: catName ? `${goalTitle} — ${catName}` : goalTitle });
    }
  };

  const shiftWeek = (delta: number) => { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() + delta * 7); setWeekStart(d); };
  const weekLabel = useMemo(() => { const end = new Date(weekStart); end.setUTCDate(end.getUTCDate() + 6); const intl = new Intl.DateTimeFormat("en-GB", { month: "short", day: "2-digit" }); return `${intl.format(weekStart)} → ${intl.format(end)}`; }, [weekStart]);

  const modeInfo = isPast ? { text: "Past week — read only", color: "bg-neutral-800", icon: <Lock className="h-4 w-4" /> } : isFuture ? { text: "Future week — picking only (no completion)", color: "bg-indigo-600", icon: <CalendarClock className="h-4 w-4" /> } : { text: "Current week — full access", color: "bg-emerald-600", icon: <CheckCircle2 className="h-4 w-4 text-white" /> };

  // -------- Dev self-tests (lightweight) --------
  useEffect(() => {
    // Basic sanity checks act like tiny "tests" in dev
    try {
      console.assert(DEFAULT_DATA.length === 6, "Expected 6 categories in DEFAULT_DATA");
      const bad = DEFAULT_DATA.find(c => c.goals.length < 2);
      if (bad) console.warn("Category has <2 goals:", bad.name);
      // Week math sanity
      const s = startOfWeekKolkata(new Date());
      console.assert(s.getUTCDay() === 1 || s.getUTCDay() === 0 || s instanceof Date, "startOfWeekKolkata returns a Date");
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_0%,#eef2ff_0%,transparent_60%),radial-gradient(1200px_600px_at_90%_100%,#ecfeff_0%,transparent_60%)] bg-slate-50 p-5">
      <div className="mx-auto max-w-[1400px]">
        {/* Top Nav */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white p-1 shadow-sm">
            <button onClick={() => setTab("goals") } className={`rounded-xl px-3 py-1.5 text-sm ${tab === "goals" ? "bg-black text-white" : "hover:bg-neutral-100"}`}>Goals</button>
            <button onClick={() => setTab("profile")} className={`rounded-xl px-3 py-1.5 text-sm ${tab === "profile" ? "bg-black text-white" : "hover:bg-neutral-100"}`}>Profile</button>
          </div>
          {tab === "goals" && (
            <div className="flex items-center gap-2">
              <button onClick={() => shiftWeek(-1)} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-neutral-50">◀ Prev</button>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm">
                <CalendarDays className="h-4 w-4" />
                <span className="tabular-nums">{weekLabel}</span>
              </div>
              <button onClick={() => shiftWeek(1)} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-neutral-50">Next ▶</button>
            </div>
          )}
        </div>

        {tab === "goals" ? (
          <>
            {/* Intro hero */}
            <div className="mt-2 mb-3">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                The Goal Challenge!
              </h1>
              <p className="mt-1 text-sm md:text-base text-neutral-700">
                Select any 2 goals from each category to follow and make your entire week exciting.
              </p>
            </div>

            {/* Milestones explainer */}
            <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-100 p-3">
                <div className="rounded-xl bg-emerald-600/90 p-2 text-white"><Trophy className="h-5 w-5"/></div>
                <div>
                  <div className="text-sm font-semibold text-emerald-900">Brilliant</div>
                  <div className="text-xs text-emerald-800/80">If you have completed <span className="font-semibold">2 activities</span> from <span className="font-semibold">all 6 categories</span>.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-fuchsia-100 p-3">
                <div className="rounded-xl bg-indigo-600/90 p-2 text-white"><Rocket className="h-5 w-5"/></div>
                <div>
                  <div className="text-sm font-semibold text-indigo-900">You rock</div>
                  <div className="text-xs text-indigo-800/80">If you have completed <span className="font-semibold">2 activities</span> from <span className="font-semibold">4 categories</span>.</div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-3">
                <div className="rounded-xl bg-amber-500/90 p-2 text-white"><Sparkles className="h-5 w-5"/></div>
                <div>
                  <div className="text-sm font-semibold text-amber-900">You're on the right track</div>
                  <div className="text-xs text-amber-800/80">If you have completed <span className="font-semibold">2 activities</span> from <span className="font-semibold">2 categories</span>.</div>
                </div>
              </div>
            </div>

            {/* Mode badge */}
            <div className="mt-1">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white ${modeInfo.color}`}>
                {modeInfo.icon}
                {modeInfo.text}
              </span>
            </div>

            {/* Milestones */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <MilestoneCard level="right" active={achievedCount >= 2} label="On the Right Track" desc="2 categories with 2 completed" />
              <MilestoneCard level="rocking" active={achievedCount >= 4} label="Rocking" desc="4 categories with 2 completed" />
              <MilestoneCard level="brilliant" active={achievedCount === 6} label="Brilliant" desc="All 6 categories achieved" />
            </div>

            {/* Columns */}
            {loadingWeek ? (
              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-56 animate-pulse rounded-3xl border border-neutral-200 bg-white/60" />
                ))}
              </div>
            ) : (
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {categories.map(cat => {
                    const pal = paletteFor(cat.name);
                    return (
                      <div key={cat.id} className={`rounded-3xl border ${pal.border} ${pal.col} p-4 shadow-md`}>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className={`text-lg font-semibold tracking-tight ${pal.heading}`}>{cat.name}</h2>
                          <span className={`text-xs inline-flex items-center gap-2 rounded-full px-2 py-1 ${pal.chip}`}>
                            {cat.goals.filter(g => g.completed).length}/2 completed
                          </span>
                        </div>
                        <SortableContext items={cat.goals.map(g => g.id)} strategy={verticalListSortingStrategy}>
                          <div className="flex flex-col gap-3">
                            {cat.goals.map(goal => (
                              <SortableGoal
                                key={goal.id}
                                goal={goal}
                                disabledDrag={isPast}
                                disabledPick={isPast}
                                disabledComplete={isPast || isFuture}
                                onTogglePicked={() => togglePicked(cat.id, goal.id)}
                                onToggleCompleted={() => toggleCompleted(cat.id, goal.id)}
                                onRename={(newTitle) => renameGoal(cat.id, goal.id, newTitle)}
                                onDuplicate={() => duplicateGoal(cat.id, goal.id)}
                                onDelete={() => requestDelete(cat.id, goal.id, goal.title)}
                                disabledRename={isPast}
                                disabledManage={isPast}
                              />
                            ))}
                          </div>
                        </SortableContext>

                        {/* Add new goal */}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={newGoalText[cat.id] || ''}
                            onChange={(e) => setNewGoalText(prev => ({ ...prev, [cat.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { addGoal(cat.id, (newGoalText[cat.id] || '').trim()); } }}
                            placeholder="Add a new goal"
                            disabled={isPast}
                            className={`flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm ${isPast ? 'opacity-50' : ''}`}
                          />
                          <button
                            onClick={() => addGoal(cat.id, (newGoalText[cat.id] || '').trim())}
                            disabled={isPast}
                            className={`inline-flex items-center gap-1 rounded-xl bg-black px-3 py-2 text-xs text-white shadow-sm ${isPast ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-800'}`}
                            title={isPast ? 'Cannot add goals in past weeks' : 'Add goal'}
                          >
                            <Plus className="h-4 w-4" /> Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DndContext>
            )}
          </>
        ) : (
          <ProfilePage />
        )}

        <div className="mt-10 text-center text-xs text-neutral-500">
          Week starts on <span className="font-medium">Monday</span>. Your progress is saved per week — in the cloud when Firebase is configured, otherwise locally on this device.
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel.open}
        title="Delete this goal?"
        description={confirmDel.title ? `This will remove "${confirmDel.title}" from this week.` : undefined}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDel({ open: false })}
      />

      <Toast show={toast.show} title={toast.title} subtitle={toast.subtitle} onClose={() => setToast(s => ({ ...s, show: false }))} />
    </div>
  );
}
