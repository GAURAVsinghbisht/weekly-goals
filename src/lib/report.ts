import type { Category } from "./core";
import {
  challengeCompletionPercent,
  getActiveDays,
  longestStreak,
} from "./metrics";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || ""; // e.g. "http://localhost:4000"


export type WeeklyMetrics = {
  completionPercent: number;
  activeDays: number;
  longestStreak: number;
  dayMap: boolean[]; // Mon..Sun
};

export function buildWeeklyMetrics(categories: Category[]): WeeklyMetrics {
  const completionPercent = challengeCompletionPercent(categories);
  const { days: dayMap, count: activeDays } = getActiveDays(categories);
  const longestStreakVal = longestStreak(dayMap);
  return {
    completionPercent,
    activeDays,
    longestStreak: longestStreakVal,
    dayMap,
  };
}

/** Calls your backend to generate a Markdown report (do NOT put your OpenAI key in the frontend) */
export async function generateAIReport(opts: {
  weekStamp: string;
  profile: { name?: string | null; email?: string | null } | null;
  categories: Category[];
}) {
  const metrics = buildWeeklyMetrics(opts.categories);
  const res = await fetch(`${API_BASE}/weekly-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      weekStamp: opts.weekStamp,
      profile: opts.profile,
      categories: opts.categories,
      metrics,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return (json?.report as string) || "";
}
