import React, { useMemo, useState } from "react";
import type { Category } from "../lib/core";
import { buildWeeklyMetrics, WeeklyMetrics } from "../lib/report";
import { CalendarDays, Download, LineChart, Percent } from "lucide-react";

function Pill({ active }: { active: boolean }) {
  return (
    <div className={`h-6 w-6 rounded-full border flex items-center justify-center ${active ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-neutral-300 text-transparent"}`}>
      ✓
    </div>
  );
}

export default function DashboardPage({
  categories,
  weekLabel,
  weekStamp,
  profile,
  onGenerateReport,
}: {
  categories: Category[];
  weekLabel: string;
  weekStamp: string;
  profile: { name?: string | null; email?: string | null } | null;
  onGenerateReport: (args: { weekStamp: string }) => Promise<string>;
}) {
  const metrics: WeeklyMetrics = useMemo(() => buildWeeklyMetrics(categories), [categories]);
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const download = () => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (profile?.name || "user").toString().replace(/\s+/g, "_").toLowerCase();
    a.href = url; a.download = `goal-challenge_report_${name}_${weekStamp}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const gen = async () => {
    setLoading(true);
    try {
      const txt = await onGenerateReport({ weekStamp });
      setReport(txt);
    } catch (e: any) {
      setReport(`**Could not generate report**\n\n${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: KPIs */}
      <div className="lg:col-span-2 space-y-4">
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
              <div className="mt-2 text-3xl font-bold">{metrics.completionPercent}%</div>
              <div className="mt-1 text-xs text-neutral-500">toward 12 weekly targets (2 per category)</div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-emerald-600" style={{ width: `${metrics.completionPercent}%` }} />
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="text-xs text-neutral-500">Active Days</div>
              <div className="mt-2 text-3xl font-bold">{metrics.activeDays}/7</div>
              <div className="mt-2 flex items-center gap-2">
                {metrics.dayMap.map((on, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <Pill active={on} />
                    <span className="text-[10px] text-neutral-500">{days[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <LineChart className="h-4 w-4" /> Continuity
              </div>
              <div className="mt-2 text-3xl font-bold">{metrics.longestStreak}d</div>
              <div className="mt-1 text-xs text-neutral-500">longest consecutive active run</div>
            </div>
          </div>
        </div>

        {/* AI Report */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Weekly AI Report</div>
            <div className="flex items-center gap-2">
              <button onClick={gen} disabled={loading} className="rounded-xl bg-black px-3 py-1.5 text-xs text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50">
                {loading ? "Generating…" : "Generate report"}
              </button>
              <button onClick={download} disabled={!report} className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs shadow-sm disabled:opacity-50">
                <Download className="h-4 w-4" /> Download .md
              </button>
            </div>
          </div>
          <pre className="max-h-[380px] overflow-auto whitespace-pre-wrap rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-800">
{report || "Click “Generate report” to get a concise, motivational summary + tips based on your week."}
          </pre>
        </div>
      </div>

      {/* Right: Simple explainer */}
      <div className="space-y-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold">How this is calculated</div>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-700">
            <li><b>Challenge Progress</b> = min(2 completed per category) / 12.</li>
            <li><b>Active Day</b> = any goal has a daily check for that day.</li>
            <li><b>Continuity</b> = longest run of active days in Mon–Sun.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
