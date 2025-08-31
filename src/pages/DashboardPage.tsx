import React, { useEffect, useMemo, useState } from "react";
import type { Category } from "../lib/core";
import { ensureFirebase } from "../lib/store";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  CalendarDays,
  Download,
  LineChart,
  Percent,
  History,
  RefreshCw,
  Flame,
  TrendingUp,
  AlertTriangle,
  Target,
  Clock,
} from "lucide-react";

/** ---------- Types ---------- */
type WeeklyMetrics = {
  completionPercent: number; // 0..100 (picked goals only)
  completedPicked: number;
  totalPicked: number;

  activeDays: number; // 0..7
  longestStreak: number; // consecutive active days
  dayMap: boolean[]; // Mon..Sun

  // Optional: simple app-usage snapshot
  interactions?: {
    totalEvents: number;
    activeDaysViaEvents: number; // unique days with any events
    lastEventISO?: string | null;
    timeOfDayHistogram?: Record<
      "morning" | "afternoon" | "evening" | "night",
      number
    >;
  };
};

type SavedWeeklyReport = {
  profileId: string;
  weekStamp: string;
  report: string; // markdown
  metrics: WeeklyMetrics;
  updatedAt?: any;
  createdAt?: any;
  id?: string; // history id (for listing)
};

type WeekEvent = {
  profileId: string;
  weekStamp: string;
  type: string;
  createdAt?: any;
};

// Firestore-safe: remove all undefineds deeply (keeps nulls)
function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map(stripUndefinedDeep) as any;
  }
  if (val && typeof val === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined) continue; // drop undefined
      out[k] = stripUndefinedDeep(v as any);
    }
    return out;
  }
  return val;
}

// Default interactions (so we never write undefined)
const DEFAULT_INTERACTIONS = {
  opens: 0,
  picks: 0,
  completes: 0,
  dayChecks: 0,
  generatedAt: new Date().toISOString(),
};

// If you’re logging interactions locally, read them; else use defaults
function getInteractionsFromStorage() {
  try {
    const raw = localStorage.getItem("gc:interactions");
    if (!raw) return { ...DEFAULT_INTERACTIONS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_INTERACTIONS, ...parsed };
  } catch {
    return { ...DEFAULT_INTERACTIONS };
  }
}

/** ---------- Small UI bits ---------- */
function Pill({ active }: { active: boolean }) {
  return (
    <div
      className={`h-6 w-6 rounded-full border flex items-center justify-center ${
        active
          ? "bg-emerald-600 border-emerald-600 text-white"
          : "bg-white border-neutral-300 text-transparent"
      }`}
    >
      ✓
    </div>
  );
}

/** ---------- Metric helpers ---------- */
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function arraysEqual(a: boolean[], b: boolean[]) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** derive a 7-day activity map from goals' daily tracking (Mon..Sun). */
function getDayMapFromDaily(categories: Category[]): boolean[] {
  const days = 7;
  const map = new Array(days).fill(false);
  for (const c of categories) {
    for (const g of c.goals as any[]) {
      const daily: boolean[] | undefined = g?.daily;
      if (Array.isArray(daily) && daily.length === 7) {
        for (let i = 0; i < 7; i++) map[i] = map[i] || !!daily[i];
      }
    }
  }
  return map;
}

/** per-category stats over picked goals */
function perCategoryPickedStats(categories: Category[]) {
  return categories.map((c) => {
    const picked = c.goals.filter((g) => g.picked);
    const completedPicked = picked.filter((g) => g.completed).length;
    const totalPicked = picked.length;
    const pct =
      totalPicked > 0 ? Math.round((completedPicked / totalPicked) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      completedPicked,
      totalPicked,
      pct,
    };
  });
}

/** Longest streak in a Monday-first week map */
function longestStreak(dayMap: boolean[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < dayMap.length; i++) {
    if (dayMap[i]) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

/** ---------- Firestore helpers (local to this page) ---------- */
async function saveWeeklyReport(
  profileId: string,
  weekStamp: string,
  report: string,
  metrics: WeeklyMetrics
) {
  const { db } = ensureFirebase();
  if (!db) return;

  // NEW: sanitize metrics to avoid nested `undefined`
  const safeMetrics = stripUndefinedDeep(metrics);

  await addDoc(collection(db, "weeklyReports"), {
    profileId,
    weekStamp,
    report,
    metrics: safeMetrics,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`),
    {
      profileId,
      weekStamp,
      report,
      metrics: safeMetrics,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function loadWeeklyReportLatest(
  profileId: string,
  weekStamp: string
): Promise<SavedWeeklyReport | null> {
  const { db } = ensureFirebase();
  if (!db) return null;
  const ref = doc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as SavedWeeklyReport;
}

async function loadWeeklyReportHistory(
  profileId: string,
  weekStamp: string,
  max = 5
): Promise<SavedWeeklyReport[]> {
  const { db } = ensureFirebase();
  if (!db) return [];
  const qy = query(
    collection(db, "weeklyReports"),
    where("profileId", "==", profileId),
    where("weekStamp", "==", weekStamp),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const s = await getDocs(qy);
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** --- Optional: pull interaction events if you log them --- */
async function loadWeekEvents(
  profileId: string,
  weekStamp: string
): Promise<WeekEvent[]> {
  console.log("dsfsdfsdfsdfsfdsfs");
  const { db } = ensureFirebase();
  if (!db) return [];
  try {
    const qy = query(
      collection(db, "events"),
      where("profileId", "==", profileId),
      where("weekStamp", "==", weekStamp),
      orderBy("createdAt", "asc")
    );
    console.log("qy: ", qy);
    const s = await getDocs(qy);
    console.log("s here: ", s);
    return s.docs.map((d) => d.data() as WeekEvent);
  } catch (e) {
    console.log("Error: ", e);
    // If no index or events not present, just ignore.
    return [];
  }
}

/** Combine daily tracking + (optional) events to build weekly metrics */
function computeWeeklyMetrics(
  categories: Category[],
  events: WeekEvent[]
): WeeklyMetrics {
  // 1) picked-goal progress
  const totalPicked = categories.reduce(
    (acc, c) => acc + c.goals.filter((g) => g.picked).length,
    0
  );
  const completedPicked = categories.reduce(
    (acc, c) => acc + c.goals.filter((g) => g.picked && g.completed).length,
    0
  );
  const completionPercent =
    totalPicked > 0 ? Math.round((completedPicked / totalPicked) * 100) : 0;

  // 2) day map from daily tracking
  const dailyMap = getDayMapFromDaily(categories);

  // 3) augment activity with events (if any)
  const timeOfDayHistogram: WeeklyMetrics["interactions"]["timeOfDayHistogram"] =
    {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
  let lastEventISO: string | null = null;
  const daysViaEvents = new Set<number>();
  for (const e of events) {
    const ts: any = (e as any).createdAt;
    const d =
      ts?.toDate?.() instanceof Date
        ? ts.toDate()
        : ts instanceof Date
        ? ts
        : null;
    if (!d) continue;
    const js = d.toISOString();
    lastEventISO = js;
    // Convert Date -> Mon=0 ... Sun=6
    const dow = (d.getUTCDay() + 6) % 7;
    daysViaEvents.add(dow);

    const h = d.getUTCHours();
    if (h >= 5 && h < 12) timeOfDayHistogram.morning++;
    else if (h >= 12 && h < 17) timeOfDayHistogram.afternoon++;
    else if (h >= 17 && h < 22) timeOfDayHistogram.evening++;
    else timeOfDayHistogram.night++;
  }

  // If events showed activity on a day, mark it active as well
  const dayMap = dailyMap.map((on, i) => on || daysViaEvents.has(i));
  const activeDays = dayMap.filter(Boolean).length;
  const streak = longestStreak(dayMap);

  const interactions =
    events.length > 0
      ? {
          totalEvents: events.length,
          activeDaysViaEvents: daysViaEvents.size,
          lastEventISO,
          timeOfDayHistogram,
        }
      : undefined;

  return {
    completionPercent,
    completedPicked,
    totalPicked,
    activeDays,
    longestStreak: streak,
    dayMap,
    interactions,
  };
}

/** ---------- Component ---------- */
export default function DashboardPage({
  categories,
  weekLabel,
  weekStamp,
  profile,
  profileId,
  onGenerateReport, // optional override; if not provided we POST to /weekly-report
}: {
  categories: Category[];
  weekLabel: string;
  weekStamp: string; // e.g., 2025-08-18
  profile: { name?: string | null; email?: string | null } | null;
  profileId: string;
  onGenerateReport?: (args: {
    weekStamp: string;
    prompt?: string;
    analytics?: any;
  }) => Promise<string>;
}) {
  const [events, setEvents] = useState<WeekEvent[]>([]);
  const [saved, setSaved] = useState<SavedWeeklyReport | null>(null);
  const [history, setHistory] = useState<SavedWeeklyReport[]>([]);
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // load events (optional) + latest + short history
  useEffect(() => {
    let on = true;
    (async () => {
      const [ev, latest, hist] = await Promise.all([
        loadWeekEvents(profileId, weekStamp),
        loadWeeklyReportLatest(profileId, weekStamp),
        loadWeeklyReportHistory(profileId, weekStamp, 5),
      ]);
      if (!on) return;
      setEvents(ev || []);
      setSaved(latest);
      setHistory(hist);
      setReport(latest?.report || "");
    })();
    return () => {
      on = false;
    };
  }, [profileId, weekStamp]);

  // compute metrics & analytics
  const metrics = useMemo(() => {
    const data = computeWeeklyMetrics(categories, events); // <-- use the events you loaded
    console.log("data: ", data);
    return data;
  }, [categories, events]);

  const catStats = useMemo(
    () => perCategoryPickedStats(categories),
    [categories]
  );

  // Behavior Highlights
  const mostActive = useMemo(() => {
    return [...catStats]
      .sort((a, b) =>
        b.completedPicked !== a.completedPicked
          ? b.completedPicked - a.completedPicked
          : b.totalPicked - a.totalPicked
      )
      .slice(0, 3);
  }, [catStats]);

  const needsImprovement = useMemo(() => {
    return catStats
      .filter((c) => c.totalPicked > 0 && c.pct < 50)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
  }, [catStats]);

  // show Generate only when completion % or dayMap changed
  const needsNew = useMemo(() => {
    if (!saved) return true;
    const prev = saved.metrics;
    return (
      prev.completionPercent !== metrics.completionPercent ||
      prev.completedPicked !== metrics.completedPicked ||
      prev.totalPicked !== metrics.totalPicked ||
      !arraysEqual(prev.dayMap || [], metrics.dayMap || [])
    );
  }, [saved, metrics]);

  async function generate() {
    setLoading(true);
    try {
      // Build a strong, explicit prompt the API can use directly.
      const analytics = {
        weekLabel,
        completionPercent: metrics.completionPercent,
        completedPicked: metrics.completedPicked,
        totalPicked: metrics.totalPicked,
        activeDays: metrics.activeDays,
        longestStreak: metrics.longestStreak,
        dayMapLabels: DAY_NAMES.map((d, i) => ({
          day: d,
          active: metrics.dayMap[i],
        })),
        mostActive,
        needsImprovement,
        timeOfDayHistogram: metrics.interactions?.timeOfDayHistogram || null,
        totalEvents: metrics.interactions?.totalEvents || 0,
        activeDaysViaEvents: metrics.interactions?.activeDaysViaEvents || 0,
      };

      const prompt = [
        "You are an upbeat, practical coach. Use emojis sparingly but effectively.",
        "Write a weekly report (max ~500 words) for the user's performance.",
        "",
        "Must-have sections:",
        "1) 🧭 Weekly snapshot — 2–4 sentences summarizing the week realistically.",
        "2) 📂 Category deep-dive — for each category with any picked goals:",
        "   • show % of picked goals completed (e.g., 60% — 3/5), and a one-sentence insight.",
        "3) ✅ Wins — up to 5 bullets of specific positives.",
        "4) ⚠️ Needs attention — include only if something actually needs work (2–4 bullets).",
        "5) 🎯 Focus plan for next week — concrete, short checklist based on THIS week's gaps (not generic).",
        "6) 🔁 This week’s focus (one line) — a motivating, specific directive.",
        "",
        "Data rules:",
        "- Progress is based ONLY on picked goals: completedPicked / totalPicked.",
        "- If totalPicked is 0, say there’s nothing to measure and suggest picking 2–4 goals.",
        "- Treat daily tracking as consistency signals; mention streaks or active days if helpful.",
        "- Be honest but supportive; no fluff.",
      ].join("\n");

      let text: string;
      if (onGenerateReport) {
        text = await onGenerateReport({ weekStamp, prompt, analytics });
      } else {
        const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
        const safeMetrics = stripUndefinedDeep(metrics);
        const r = await fetch(`${API_BASE}/weekly-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekStamp,
            profile: {
              name: profile?.name || null,
              email: profile?.email || null,
            },
            categories,
            metrics: safeMetrics,
            analytics,
          }),
        });
        if (!r.ok) throw new Error(`API error ${r.status}`);
        const j = await r.json();
        text = j?.report || "";
      }
      setReport(text);

      // persist to Firestore (history + latest)
      await saveWeeklyReport(profileId, weekStamp, text, metrics);

      // refresh latest + history to reflect stored state
      const latest = await loadWeeklyReportLatest(profileId, weekStamp);
      const hist = await loadWeeklyReportHistory(profileId, weekStamp, 5);
      setSaved(latest);
      setHistory(hist);
    } catch (e: any) {
      setReport(
        "Could not generate report, Please try again after some time, or reload this page/screen"
      );
    } finally {
      setLoading(false);
    }
  }

  function download() {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (profile?.name || "user")
      .toString()
      .replace(/\s+/g, "_")
      .toLowerCase();
    a.href = url;
    a.download = `goal-challenge_report_${name}_${weekStamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: KPIs + Report */}
      <div className="lg:col-span-2 space-y-4">
        {/* KPIs */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <CalendarDays className="h-4 w-4" />
              <span>{weekLabel}</span>
            </div>
            <div className="text-xs text-neutral-500">Dashboard</div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Progress based on picked goals */}
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Percent className="h-4 w-4" /> Progress (picked goals)
              </div>
              <div className="mt-2 text-3xl font-bold">
                {metrics.completionPercent}%
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {metrics.completedPicked}/{metrics.totalPicked} picked goals
                completed
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full bg-emerald-600"
                  style={{ width: `${metrics.completionPercent}%` }}
                />
              </div>
            </div>

            {/* Active days (daily or events) */}
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="text-xs text-neutral-500">Active Days</div>
              <div className="mt-2 text-3xl font-bold">
                {metrics.activeDays}/7
              </div>
              <div className="mt-2 flex items-center gap-2">
                {metrics.dayMap.map((on, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <Pill active={on} />
                    <span className="text-[10px] text-neutral-500">
                      {DAY_NAMES[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Continuity */}
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <LineChart className="h-4 w-4" /> Continuity
              </div>
              <div className="mt-2 text-3xl font-bold">
                {metrics.longestStreak}d
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                longest consecutive active run
              </div>
            </div>
          </div>
        </div>

        {/* Behavior Highlights */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Behavior Highlights</div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
                <TrendingUp className="h-4 w-4" /> Most active categories
              </div>
              {mostActive.length === 0 ? (
                <div className="text-sm text-neutral-500">
                  Pick some goals to get started.
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {mostActive.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2"
                    >
                      <div className="truncate">{c.name}</div>
                      <div className="shrink-0 text-xs text-neutral-600">
                        {c.pct}% ({c.completedPicked}/{c.totalPicked})
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
                <AlertTriangle className="h-4 w-4" /> Needs improvement
              </div>
              {needsImprovement.length === 0 ? (
                <div className="text-sm text-neutral-500">
                  No red flags. Keep it up!
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {needsImprovement.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl bg-rose-50/60 px-3 py-2"
                    >
                      <div className="truncate">{c.name}</div>
                      <div className="shrink-0 text-xs text-rose-600">
                        {c.pct}% ({c.completedPicked}/{c.totalPicked})
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Report */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Weekly AI Report</div>
            <div className="flex items-center gap-2">
              {/* Show generate only when needed */}
              {needsNew && (
                <button
                  onClick={generate}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-xl bg-black px-3 py-1.5 text-xs text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />{" "}
                  {loading
                    ? "Generating…"
                    : saved
                    ? "Generate updated"
                    : "Generate report"}
                </button>
              )}
              <button
                onClick={download}
                disabled={!report}
                className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs shadow-sm disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download .md
              </button>
            </div>
          </div>

          {saved && needsNew && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <History className="h-4 w-4" />
              Metrics changed since the last report. Showing your previous
              report below — you can generate an updated one.
            </div>
          )}

          <pre className="max-h-[380px] overflow-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-800">
            {report ||
              "No saved report yet. Your metrics haven’t changed since the last report."}
          </pre>

          {history.length > 1 && (
            <div className="mt-3 text-xs text-neutral-500">
              Previous reports: {history.slice(1).length} stored
            </div>
          )}
        </div>
      </div>

      {/* Right: Explainer + App Activity */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">How this is calculated</div>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-700">
            <li>
              <b>Progress</b> = completed <i>picked</i> goals ÷ total picked
              goals.
            </li>
            <li>
              <b>Active Day</b> = any daily check OR any interaction event on
              that day (Mon–Sun).
            </li>
            <li>
              <b>Continuity</b> = longest run of active days this week.
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" />
            App Activity
          </div>
          {metrics.interactions ? (
            <div className="text-sm text-neutral-700">
              <div className="flex items-center justify-between">
                <div>Total interactions</div>
                <div className="font-medium">
                  {metrics.interactions.totalEvents}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div>Active days via events</div>
                <div className="font-medium">
                  {metrics.interactions.activeDaysViaEvents}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                Peaks by time of day (UTC):{" "}
                {["morning", "afternoon", "evening", "night"].map((k) => {
                  const v =
                    (metrics.interactions!.timeOfDayHistogram as any)?.[k] || 0;
                  return (
                    <span key={k} className="mr-2">
                      {k}:{v}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">
              Enable event logging to see your interaction patterns.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
