
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { Category } from "../lib/core";
import { DEFAULT_DATA, uid } from "../lib/core";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi96DII_BSsZfn8FsdGkjTcUbYrwd_Yf4",
  authDomain:  "week-gaols.firebaseapp.com",
  projectId: "week-gaols",
  storageBucket: "week-gaols.firebasestorage.app",
  messagingSenderId: "213614122894",
  appId: "1:213614122894:web:aa7c849086047a24ebb6df",
};
const hasFirebaseConfig = () => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let _fbApp: any; let db: any; let storage: any;
export function ensureFirebase() {
  if (!_fbApp && hasFirebaseConfig()) {
    try {
      _fbApp = initializeApp(FIREBASE_CONFIG);
      db = getFirestore(_fbApp);
      storage = getStorage(_fbApp);
    } catch (e) { console.warn("Firebase init failed", e); }
  }
  return { db, storage };
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
    } catch (e) { console.warn("loadWeekData firestore", e); }
  }
  const local = localStorage.getItem(`goal-challenge:${weekStamp}`);
  if (local) { try { return JSON.parse(local) as Category[]; } catch {} }
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
    } catch (e) { console.warn("saveWeekData firestore", e); }
  }
  localStorage.setItem(`goal-challenge:${weekStamp}`, JSON.stringify(categories));
}
