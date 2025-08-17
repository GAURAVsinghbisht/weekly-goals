import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import type { Category } from "../lib/core";
import { DEFAULT_DATA, uid } from "../lib/core";
// NOTE: Firestore helpers are still imported directly where used to avoid circular deps
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
// ---- Config ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi96DII_BSsZfn8FsdGkjTcUbYrwd_Yf4",
  authDomain:  "week-gaols.firebaseapp.com",
  projectId: "week-gaols",
  storageBucket: "week-gaols.firebasestorage.app",
  messagingSenderId: "213614122894",
  appId: "1:213614122894:web:aa7c849086047a24ebb6df",
};

const hasFirebaseConfig = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let _app: ReturnType<typeof initializeApp> | undefined;
let _db: ReturnType<typeof getFirestore> | undefined;
let _storage: ReturnType<typeof getStorage> | undefined;
let _auth: ReturnType<typeof getAuth> | undefined;

export function ensureFirebase() {
  // Make it HMR-safe and avoid double-initting Firestore with different settings
  const g = globalThis as any;
  if (!g.__GOAL_CHALLENGE_FB__) {
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    let db;
    try {
      // Only the first time we try to set custom settings; if already initialized, fall back
      db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
    } catch {
      db = getFirestore(app);
    }
    const storage = getStorage(app);
    const auth = getAuth(app);
    g.__GOAL_CHALLENGE_FB__ = { app, db, storage, auth };
  }
  return g.__GOAL_CHALLENGE_FB__ as { app: ReturnType<typeof getApp>, db: ReturnType<typeof getFirestore>, storage: ReturnType<typeof getStorage>, auth: ReturnType<typeof getAuth> };
}

export function freshWeekTemplate(): Category[] {
  return DEFAULT_DATA.map(c => ({ ...c, id: uid(), goals: c.goals.map(g => ({ ...g, id: uid(), picked: false, completed: false })) }));
}



export async function loadWeekData(profileId: string, weekStamp: string): Promise<Category[]> {
  const { db } = ensureFirebase();
  if (db) {
    try {
      const snap = await getDoc(doc(db, "weeklyGoals", `${profileId}_${weekStamp}`));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (Array.isArray(data.categories)) return data.categories as Category[];
      }
    } catch (e) {
      console.warn("loadWeekData firestore", e);
    }
  }
  const local = localStorage.getItem(`goal-challenge:${weekStamp}`);
  if (local) { try { return JSON.parse(local) as Category[]; } catch { /* ignore */ } }
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
    } catch (e) {
      console.warn("saveWeekData firestore", e);
    }
  }
  localStorage.setItem(`goal-challenge:${weekStamp}`, JSON.stringify(categories));
}
