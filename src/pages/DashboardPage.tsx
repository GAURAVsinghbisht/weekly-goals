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
} from "lucide-react";

/** ---------- Types ---------- */
type WeeklyMetrics = {
  completionPercent: number; // 0..100
  activeDays: number; // 0..7
  longestStreak: number; // consecutive active days
  dayMap: boolean[]; // Mon..Sun
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

/** ---------- Metric helpers (self-contained) ---------- */
function arraysEqual(a: boolean[], b: boolean[]) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** derive a 7-day activity map from goals if present.
 * Checks common field names we’ve used: daily, dailyMap, daily7 (boolean[7]).
 */
function getDayMap(categories: Category[]): boolean[] {
  const days = 7;
  const map = new Array(days).fill(false);
  for (const c of categories) {
    for (const g of c.goals as any[]) {
      const daily: boolean[] | undefined = g?.daily ?? g?.dailyMap ?? g?.daily7;
      if (Array.isArray(daily) && daily.length === 7) {
        for (let i = 0; i < 7; i++) map[i] = map[i] || !!daily[i];
      }
    }
  }
  return map;
}

function computeWeeklyMetrics(categories: Category[]): WeeklyMetrics {
  // progress: sum(min(2, completed per category)) / (6 * 2)
  const perCatCompleted = categories.map(
    (c) => c.goals.filter((g) => g.completed).length
  );
  const earned = perCatCompleted.reduce((acc, n) => acc + Math.min(2, n), 0);
  const total = categories.length * 2 || 1;
  const completionPercent = Math.round((earned / total) * 100);

  const dayMap = getDayMap(categories);
  const activeDays = dayMap.filter(Boolean).length;

  // longest streak (Mon..Sun)
  let longest = 0,
    cur = 0;
  for (let i = 0; i < dayMap.length; i++) {
    if (dayMap[i]) {
      cur++;
      longest = Math.max(longest, cur);
    } else cur = 0;
  }

  return { completionPercent, activeDays, longestStreak: longest, dayMap };
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

  // history
  await addDoc(collection(db, "weeklyReports"), {
    profileId,
    weekStamp,
    report,
    metrics,
    createdAt: serverTimestamp(),
  });

  // latest snapshot
  await setDoc(
    doc(db, "weeklyReportsLatest", `${profileId}_${weekStamp}`),
    { profileId, weekStamp, report, metrics, updatedAt: serverTimestamp() },
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
  onGenerateReport?: (args: { weekStamp: string }) => Promise<string>;
}) {
  const metrics = useMemo(() => computeWeeklyMetrics(categories), [categories]);

  const [saved, setSaved] = useState<SavedWeeklyReport | null>(null);
  const [history, setHistory] = useState<SavedWeeklyReport[]>([]);
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // load latest + short history
  useEffect(() => {
    let on = true;
    (async () => {
      const latest = await loadWeeklyReportLatest(profileId, weekStamp);
      const hist = await loadWeeklyReportHistory(profileId, weekStamp, 5);
      if (!on) return;
      setSaved(latest);
      setHistory(hist);
      setReport(latest?.report || "");
    })();
    return () => {
      on = false;
    };
  }, [profileId, weekStamp]);

  // show Generate only when completion % or dayMap changed
  const needsNew = useMemo(() => {
    if (!saved) return true;
    const prev = saved.metrics;
    return (
      prev.completionPercent !== metrics.completionPercent ||
      !arraysEqual(prev.dayMap || [], metrics.dayMap || [])
    );
  }, [saved, metrics]);

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  async function generate() {
    setLoading(true);
    try {
      let text: string;
      if (onGenerateReport) {
        text = await onGenerateReport({ weekStamp });
      } else {
        const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";
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
            metrics,
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
      setReport(`**Could not generate report**\n\n${e?.message || String(e)}`);
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
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Percent className="h-4 w-4" /> Challenge Progress
              </div>
              <div className="mt-2 text-3xl font-bold">
                {metrics.completionPercent}%
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                toward 12 weekly targets (2 per category)
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full bg-emerald-600"
                  style={{ width: `${metrics.completionPercent}%` }}
                />
              </div>
            </div>

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
                      {days[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

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

      {/* Right: Explainer */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">How this is calculated</div>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-700">
            <li>
              <b>Challenge Progress</b> = sum over categories of{" "}
              <i>min(2, completed)</i> divided by 12.
            </li>
            <li>
              <b>Active Day</b> = any goal has a daily check for that day
              (Mon–Sun).
            </li>
            <li>
              <b>Continuity</b> = longest run of active days this week.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
