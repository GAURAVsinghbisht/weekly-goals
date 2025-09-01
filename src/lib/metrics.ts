import type { Category } from "./core";

/** % progress toward the challenge target (2 per category) */
export function challengeCompletionPercent(categories: Category[]): number {
  const targetPerCat = 2;
  const totalTarget = targetPerCat * (categories?.length || 0);
  if (!totalTarget) return 0;
  const achieved = categories.reduce((sum, c) => {
    const done = c.goals.filter(g => g.completed).length;
    return sum + Math.min(targetPerCat, done);
  }, 0);
  return Math.round((achieved / totalTarget) * 100);
}

/** Active day = any goal with daily[idx] checked */
export function getActiveDays(categories: Category[]): { days: boolean[]; count: number } {
  const days = Array(7).fill(false);
  for (const c of categories) {
    for (const g of c.goals) {
      const d = Array.isArray(g.daily) ? g.daily : [];
      for (let i = 0; i < Math.min(7, d.length); i++) {
        if (d[i]) days[i] = true;
      }
    }
  }
  const count = days.filter(Boolean).length;
  return { days, count };
}

/** Longest consecutive run inside the given week (array of 7 booleans) */
export function longestStreak(days: boolean[]): number {
  let best = 0, cur = 0;
  for (let i = 0; i < days.length; i++) {
    if (days[i]) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}
