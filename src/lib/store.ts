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

export async function saveWeekData(
  profileId: string,
  weekStamp: string,
  categories: Category[]
) {
  let savedToFirestore = false;
  const { db } = ensureFirebase();

  // Try to save to Firestore first
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

      savedToFirestore = true;
    } catch (e) {
      console.warn("saveWeekData firestore failed, falling back to localStorage", e);
    }
  }

  // Always save to localStorage as backup, especially important for anonymous users
  // This ensures data persistence when user is not authenticated or Firebase fails
  try {
    localStorage.setItem(`goal-challenge:${weekStamp}`, JSON.stringify(categories));
    if (!savedToFirestore) {
      console.log(`Data saved to localStorage for week ${weekStamp} (profileId: ${profileId})`);
    }
  } catch (e) {
    console.warn("localStorage save failed", e);
  }
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

/**
 * Syncs anonymous user data to authenticated user account after login
 * This merges local data with Firebase data, preserving user's work from before login
 */
export async function syncAnonymousToAuthenticatedUser(
  anonymousProfileId: string,
  authenticatedProfileId: string
) {
  if (!anonymousProfileId || !authenticatedProfileId || anonymousProfileId === authenticatedProfileId) {
    return;
  }

  const { db } = ensureFirebase();
  if (!db) return;

  try {
    console.log(`Starting sync from anonymous ${anonymousProfileId} to authenticated ${authenticatedProfileId}`);

    // 1. Get all localStorage data for the anonymous user
    const prefix = "goal-challenge:";
    const allLocalKeys = Object.keys(localStorage);
    const localKeys = allLocalKeys.filter(
      (k) => k.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(k.slice(prefix.length))
    );

    console.log("All localStorage keys:", allLocalKeys);
    console.log("Filtered week keys:", localKeys);

    // 2. Get all Firebase data for the anonymous user (if any was synced)
    const anonymousData = new Map<string, Category[]>();

    // Check Firebase for anonymous user data
    for (const key of localKeys) {
      const weekStamp = key.slice(prefix.length);
      try {
        const anonymousDoc = await getDoc(doc(db, "weeklyGoals", `${anonymousProfileId}_${weekStamp}`));
        if (anonymousDoc.exists()) {
          const data = anonymousDoc.data() as any;
          if (Array.isArray(data.categories)) {
            anonymousData.set(weekStamp, data.categories);
          }
        }
      } catch (e) {
        console.warn(`Error fetching anonymous Firebase data for ${weekStamp}:`, e);
      }
    }

    // 3. Also check localStorage for any unsaved data
    for (const key of localKeys) {
      const weekStamp = key.slice(prefix.length);
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const localCategories = JSON.parse(raw) as Category[];
          console.log(`Found localStorage data for ${weekStamp}:`, localCategories.length, "categories");

          // Use localStorage data if we don't have Firebase data, or if localStorage is newer
          if (!anonymousData.has(weekStamp)) {
            anonymousData.set(weekStamp, localCategories);
          }
        }
      } catch (e) {
        console.warn(`Error parsing localStorage data for ${key}:`, e);
      }
    }

    if (anonymousData.size === 0) {
      console.log("No anonymous data found to sync");
      // Still mark as synced to avoid repeated checks
      localStorage.setItem(`goal-challenge:synced:${authenticatedProfileId}`, "1");
      return;
    }

    // 4. For each week with anonymous data, merge with authenticated user data
    for (const [weekStamp, anonymousCategories] of anonymousData) {
      try {
        const authenticatedRef = doc(db, "weeklyGoals", `${authenticatedProfileId}_${weekStamp}`);
        const authenticatedSnap = await getDoc(authenticatedRef);

        let finalCategories: Category[] = anonymousCategories;

        if (authenticatedSnap.exists()) {
          // Authenticated user has data for this week - merge intelligently
          const authenticatedData = authenticatedSnap.data() as any;
          const authenticatedCategories: Category[] = authenticatedData.categories || [];

          // Smart merge: preserve user's progress from anonymous session
          finalCategories = mergeWeekData(anonymousCategories, authenticatedCategories);
          console.log(`Merged data for week ${weekStamp}: ${anonymousCategories.length} anonymous + ${authenticatedCategories.length} authenticated categories`);
        } else {
          // No authenticated data for this week, use anonymous data as-is
          console.log(`Using anonymous data for week ${weekStamp}: ${anonymousCategories.length} categories`);
        }

        // Save merged data to authenticated user
        await setDoc(
          authenticatedRef,
          {
            profileId: authenticatedProfileId,
            weekStamp,
            categories: finalCategories,
            updatedAt: serverTimestamp(),
            syncedFromAnonymous: true // Flag to indicate this was synced
          },
          { merge: true }
        );

        // Clean up anonymous data from Firebase
        try {
          const anonymousRef = doc(db, "weeklyGoals", `${anonymousProfileId}_${weekStamp}`);
          const anonymousSnap = await getDoc(anonymousRef);
          if (anonymousSnap.exists()) {
            // Delete anonymous document rather than overwrite
            // We'll let it stay but not actively clean up to avoid data loss
            console.log(`Anonymous Firebase data preserved for ${weekStamp} (not deleted for safety)`);
          }
        } catch (e) {
          console.warn(`Error cleaning up anonymous Firebase data for ${weekStamp}:`, e);
        }

      } catch (e) {
        console.warn(`Error syncing week ${weekStamp}:`, e);
      }
    }

    // 5. Clean up localStorage
    for (const key of localKeys) {
      try {
        localStorage.removeItem(key);
        console.log(`Removed localStorage key: ${key}`);
      } catch (e) {
        console.warn(`Error removing localStorage key ${key}:`, e);
      }
    }

    // 6. Migrate template if exists
    try {
      const templateSnap = await getDoc(doc(db, "weeklyTemplates", anonymousProfileId));
      if (templateSnap.exists()) {
        const templateData = templateSnap.data();
        await setDoc(
          doc(db, "weeklyTemplates", authenticatedProfileId),
          {
            ...templateData,
            updatedAt: serverTimestamp(),
            syncedFromAnonymous: true
          },
          { merge: true }
        );
        console.log("Synced weekly template");
      }
    } catch (e) {
      console.warn("Error syncing template:", e);
    }

    // 7. Set sync completion flag
    localStorage.setItem(`goal-challenge:synced:${authenticatedProfileId}`, "1");
    console.log(`Sync completed for ${authenticatedProfileId}`);

  } catch (e) {
    console.error("Error during anonymous-to-authenticated sync:", e);
  }
}

/**
 * Intelligently merges anonymous and authenticated week data
 * Prioritizes user progress (picks, completions) from anonymous data
 * while preserving any additional goals from authenticated data
 */
function mergeWeekData(anonymousCategories: Category[], authenticatedCategories: Category[]): Category[] {
  const merged: Category[] = [];
  const authenticatedMap = new Map(authenticatedCategories.map(cat => [cat.name, cat]));

  // Start with anonymous categories (preserve user's recent work)
  for (const anonCat of anonymousCategories) {
    const authCat = authenticatedMap.get(anonCat.name);

    if (!authCat) {
      // Category only exists in anonymous data, keep as-is
      merged.push(anonCat);
    } else {
      // Category exists in both, merge goals intelligently
      const mergedGoals = mergeGoals(anonCat.goals, authCat.goals);
      merged.push({
        ...anonCat, // Preserve anonymous category settings
        goals: mergedGoals
      });
      authenticatedMap.delete(anonCat.name); // Mark as processed
    }
  }

  // Add any remaining authenticated categories that weren't in anonymous data
  for (const [_, authCat] of authenticatedMap) {
    merged.push(authCat);
  }

  return merged;
}

/**
 * Merges goal arrays, prioritizing progress from anonymous user
 */
function mergeGoals(anonymousGoals: any[], authenticatedGoals: any[]): any[] {
  const merged: any[] = [];
  const authenticatedMap = new Map(authenticatedGoals.map(goal => [goal.title, goal]));

  // Start with anonymous goals (preserve user's recent work)
  for (const anonGoal of anonymousGoals) {
    const authGoal = authenticatedMap.get(anonGoal.title);

    if (!authGoal) {
      // Goal only exists in anonymous data
      merged.push(anonGoal);
    } else {
      // Goal exists in both, prefer anonymous progress but merge other data
      merged.push({
        ...authGoal,
        // Preserve progress from anonymous session
        picked: anonGoal.picked || authGoal.picked,
        completed: anonGoal.completed || authGoal.completed,
        trackDaily: anonGoal.trackDaily || authGoal.trackDaily,
        daily: anonGoal.daily || authGoal.daily,
        // Use anonymous ID to maintain consistency
        id: anonGoal.id
      });
      authenticatedMap.delete(anonGoal.title); // Mark as processed
    }
  }

  // Add any authenticated goals that weren't in anonymous data
  for (const [_, authGoal] of authenticatedMap) {
    merged.push(authGoal);
  }

  return merged;
}

// bump simple local counters for quick UI
function bumpLocalInteractions(kind: string) {
  try {
    const raw = localStorage.getItem("gc:interactions");
    const obj = raw
      ? JSON.parse(raw)
      : { opens: 0, picks: 0, completes: 0, dayChecks: 0 };
    if (kind === "open_week") obj.opens++;
    if (kind === "pick_on" || kind === "pick_off") obj.picks++;
    if (kind === "completed") obj.completes++;
    if (kind === "daycheck_on" || kind === "daycheck_off") obj.dayChecks++;
    obj.generatedAt = new Date().toISOString();
    localStorage.setItem("gc:interactions", JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

// Lightweight event logger (safe if Firestore not configured)
export async function logEvent(
  profileId: string,
  weekStamp: string,
  type: string,
  extra?: any
) {
  bumpLocalInteractions(type);

  const { db } = ensureFirebase();
  if (!db) return;
  try {
    await addDoc(collection(db, "events"), {
      profileId,
      weekStamp,
      type,
      extra: extra ?? null,
      createdAt: serverTimestamp(),
    } as any);
  } catch (e) {
    console.warn("loadWeekEvents error", e);
    return [];
  }
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
