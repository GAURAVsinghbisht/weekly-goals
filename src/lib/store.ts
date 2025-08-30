import { initializeApp, getApps, getApp } from "firebase/app";
import {
  // init
  getFirestore,
  initializeFirestore,

  // CRUD
  doc,
  getDoc,
  setDoc,
  serverTimestamp,

  // Query APIs
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,

  // Aliased duplicates used elsewhere in your file
  doc as fdoc,
  getDoc as fgetDoc,
  setDoc as fsetDoc,
  serverTimestamp as fServerTimestamp,
} from "firebase/firestore";

import { getStorage } from "firebase/storage";
import type { Category } from "../lib/core";
import {
  DEFAULT_DATA,
  uid,
  startOfWeekKolkata,
  fmtDateUTCYYYYMMDD,
} from "../lib/core";
import { getAuth } from "firebase/auth";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi96DII_BSsZfn8FsdGkjTcUbYrwd_Yf4",
  authDomain: "week-gaols.firebaseapp.com",
  projectId: "week-gaols",
  storageBucket: "week-gaols.firebasestorage.app",
  messagingSenderId: "213614122894",
  appId: "1:213614122894:web:aa7c849086047a24ebb6df",
};
const hasFirebaseConfig = () =>
  !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let _fbApp: any;
let db: any;
let storage: any;
export function ensureFirebase() {
  const g = globalThis as any;
  if (g.__GOAL_CHALLENGE_FB__) return g.__GOAL_CHALLENGE_FB__;

  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

  let db;
  try {
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    db = getFirestore(app);
  }

  const storage = getStorage(app);
  const auth = getAuth(app);

  g.__GOAL_CHALLENGE_FB__ = { app, db, storage, auth };
  return g.__GOAL_CHALLENGE_FB__;
}

export function freshWeekTemplate(): Category[] {
  return DEFAULT_DATA.map((c) => ({
    ...c,
    id: uid(),
    goals: c.goals.map((g) => ({
      ...g,
      id: uid(),
      picked: false,
      completed: false,
    })),
  }));
}

function sanitizeForTemplate(categories: Category[]): Category[] {
  // keep names, reset flags, fresh ids
  return categories.map((c) => ({
    id: uid(),
    name: c.name,
    goals: (c.goals || []).map((g) => ({
      id: uid(),
      title: g.title,
      picked: false,
      completed: false,
    })),
  }));
}

async function loadTemplateCategories(
  profileId: string
): Promise<Category[] | null> {
  const { db } = ensureFirebase();
  if (!db) return null;
  const t = await getDoc(doc(db, "weeklyTemplates", profileId));
  if (!t.exists()) return null;
  const data = t.data() as any;
  if (Array.isArray(data.categories)) {
    // fresh ids each week to keep dnd-kit happy
    return sanitizeForTemplate(data.categories);
  }
  return null;
}

async function saveTemplateFromCurrentWeek(
  profileId: string,
  categories: Category[]
) {
  const { db } = ensureFirebase();
  if (!db) return;
  const sanitized = sanitizeForTemplate(categories);
  await setDoc(
    doc(db, "weeklyTemplates", profileId),
    { categories: sanitized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function loadWeekData(
  profileId: string,
  weekStamp: string
): Promise<Category[]> {
  const { db } = ensureFirebase();
  // 1) Try existing week doc
  if (db) {
    try {
      const snap = await getDoc(
        doc(db, "weeklyGoals", `${profileId}_${weekStamp}`)
      );
      if (snap.exists()) {
        const data = snap.data() as any;
        if (Array.isArray(data.categories))
          return data.categories as Category[];
      }
    } catch (e) {
      console.warn("loadWeekData firestore", e);
    }
  }

  // 2) Seed from per-user template if present
  try {
    const templ = await loadTemplateCategories(profileId);
    if (templ && templ.length) return templ;
  } catch (e) {
    console.warn("loadWeekData template", e);
  }

  // 3) (Optional) Legacy local fallback
  const local = localStorage.getItem(`goal-challenge:${weekStamp}`);
  if (local) {
    try {
      return JSON.parse(local) as Category[];
    } catch {
      /* ignore */
    }
  }

  // 4) Default seed
  return freshWeekTemplate();
}

export async function saveWeekData(profileId: string, weekStamp: string, categories: Category[]) {
  const { db } = ensureFirebase();
  if (db) {
    try {
      await setDoc(
        doc(db, "weeklyGoals", `${profileId}_${weekStamp}`),
        { profileId, weekStamp, categories, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // If saving the CURRENT week, also update the template used for FUTURE weeks
      const currentStamp = fmtDateUTCYYYYMMDD(startOfWeekKolkata());
      if (weekStamp === currentStamp) {
        await saveTemplateFromCurrentWeek(profileId, categories);
      }
    } catch (e) {
      console.warn("saveWeekData firestore", e);
    }
  }

  // (Optional) Legacy local fallback
  //localStorage.setItem(`goal-challenge:${weekStamp}`, JSON.stringify(categories));
}

export async function migrateLocalWeeks(profileId: string) {
  const { db } = ensureFirebase();
  if (!db || !profileId) return;

  const flagKey = `goal-challenge:migrated:${profileId}`;
  if (localStorage.getItem(flagKey) === "1") return;

  const prefix = "goal-challenge:";
  const keys = Object.keys(localStorage).filter(
    (k) =>
      k.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(k.slice(prefix.length))
  );

  for (const k of keys) {
    const weekStamp = k.slice(prefix.length);
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const categories = JSON.parse(raw) as Category[];
      const ref = doc(db, "weeklyGoals", `${profileId}_${weekStamp}`);
      const exists = (await getDoc(ref)).exists();
      if (!exists) {
        await setDoc(
          ref,
          { profileId, weekStamp, categories, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      localStorage.removeItem(k);
    } catch (e) {
      console.warn("migrateLocalWeeks error for", k, e);
    }
  }

  localStorage.setItem(flagKey, "1");
}

// ===== Weekly AI Report persistence (Firestore) =====
// Keep the type local to avoid circular deps
export type WeeklyMetricsLite = {
  completionPercent: number;
  activeDays: number;
  longestStreak: number;
  dayMap: boolean[]; // Mon..Sun
};

export type SavedWeeklyReport = {
  id?: string;
  profileId: string;
  weekStamp: string; // e.g., 2025-08-18
  report: string; // markdown
  metrics: WeeklyMetricsLite;
  createdAt?: any;
  updatedAt?: any;
};

/** Save a new version and upsert the latest snapshot */
export async function saveWeeklyReport(
  profileId: string,
  weekStamp: string,
  report: string,
  metrics: WeeklyMetricsLite
): Promise<void> {
  const { db } = ensureFirebase();
  if (!db) return;
  // history collection with auto id
  await addDoc(collection(db, "weeklyReports"), {
    profileId,
    weekStamp,
    report,
    metrics,
    createdAt: fServerTimestamp(),
  });
  // latest doc for quick fetch
  await fsetDoc(
    fdoc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`),
    { profileId, weekStamp, report, metrics, updatedAt: fServerTimestamp() },
    { merge: true }
  );
}

/** Load the latest report snapshot for a given user+week */
export async function loadWeeklyReportLatest(
  profileId: string,
  weekStamp: string
): Promise<SavedWeeklyReport | null> {
  const { db } = ensureFirebase();
  if (!db) return null;
  const ref = fdoc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`);
  const snap = await fgetDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as SavedWeeklyReport;
  return { ...data };
}

/** Optional: fetch recent history (newest first) */
export async function loadWeeklyReportHistory(
  profileId: string,
  weekStamp: string,
  max = 5
): Promise<SavedWeeklyReport[]> {
  const { db } = ensureFirebase();
  if (!db) return [];
  const q = query(
    collection(db, "weeklyReports"),
    where("profileId", "==", profileId),
    where("weekStamp", "==", weekStamp),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
