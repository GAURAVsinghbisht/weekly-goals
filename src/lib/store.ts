import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc as fdoc,
  getDoc as fgetDoc,
  setDoc as fsetDoc,
  serverTimestamp as fServerTimestamp,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { Category } from "../lib/core";
import { DEFAULT_DATA, uid } from "../lib/core";

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

export async function loadWeekData(
  profileId: string,
  weekStamp: string
): Promise<Category[]> {
  const { db } = ensureFirebase();
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
  const local = localStorage.getItem(`goal-challenge:${weekStamp}`);
  if (local) {
    try {
      return JSON.parse(local) as Category[];
    } catch {}
  }
  return freshWeekTemplate();
}

export async function saveWeekData(
  profileId: string,
  weekStamp: string,
  categories: Category[]
) {
  const { db } = ensureFirebase();
  if (db) {
    try {
      await setDoc(
        doc(db, "weeklyGoals", `${profileId}_${weekStamp}`),
        { profileId, weekStamp, categories, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.warn("saveWeekData firestore", e);
    }
  }
  localStorage.setItem(
    `goal-challenge:${weekStamp}`,
    JSON.stringify(categories)
  );
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
export async function saveWeeklyReport(profileId: string, weekStamp: string, report: string, metrics: WeeklyMetricsLite): Promise<void> {
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
  export async function loadWeeklyReportLatest(profileId: string, weekStamp: string): Promise<SavedWeeklyReport | null> {
  const { db } = ensureFirebase();
  if (!db) return null;
  const ref = fdoc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`);
  const snap = await fgetDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as SavedWeeklyReport;
  return { ...data };
  }
  
  
  /** Optional: fetch recent history (newest first) */
  export async function loadWeeklyReportHistory(profileId: string, weekStamp: string, max = 5): Promise<SavedWeeklyReport[]> {
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
  return s.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
