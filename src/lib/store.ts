import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import type { Category } from "../lib/core";
import { DEFAULT_DATA, uid } from "../lib/core";

// Inline fallback (yours) — keep your bucket as provided
const HARDCODED = {
  apiKey: "AIzaSyCi96DII_BSsZfn8FsdGkjTcUbYrwd_Yf4",
  authDomain: "week-gaols.firebaseapp.com",
  projectId: "week-gaols",
  storageBucket: "week-gaols.firebasestorage.app", // keep as you confirmed
  messagingSenderId: "213614122894",
  appId: "1:213614122894:web:aa7c849086047a24ebb6df",
};

// Prefer env when available, else fallback to inline
const FIREBASE_CONFIG = {
  apiKey:  HARDCODED.apiKey,
  authDomain:  HARDCODED.authDomain,
  projectId:  HARDCODED.projectId,
  storageBucket: HARDCODED.storageBucket,
  messagingSenderId:  HARDCODED.messagingSenderId,
  appId: HARDCODED.appId,
};

const hasFirebaseConfig = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

// Keep singletons across HMR
let cached: { app: any; db: any; storage: any; auth: any } | undefined;

export function ensureFirebase() {
  if (cached) return cached;
  if (!hasFirebaseConfig()) return { app: undefined, db: undefined, storage: undefined, auth: undefined };

  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

  // Initialize Firestore reliably (avoid watch/stream issues across HMR)
  let db: any;
  try {
    db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
  } catch {
    db = getFirestore(app);
  }
  const storage = getStorage(app);
  const auth = getAuth(app);

  cached = { app, db, storage, auth };
  return cached;
}

export function freshWeekTemplate(): Category[] {
  return DEFAULT_DATA.map(c => ({
    ...c,
    id: uid(),
    goals: c.goals.map(g => ({ ...g, id: uid(), picked: false, completed: false })),
  }));
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