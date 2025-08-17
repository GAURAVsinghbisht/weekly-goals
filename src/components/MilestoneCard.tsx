
import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function MilestoneCard({ level, active, label, desc }: { level: "right" | "rocking" | "brilliant"; active: boolean; label: string; desc: string; }) {
  const palette = level === "brilliant" ? "bg-gradient-to-tr from-emerald-500 to-lime-500" : level === "rocking" ? "bg-gradient-to-tr from-indigo-500 to-fuchsia-500" : "bg-gradient-to-tr from-amber-500 to-orange-500";
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-neutral-200 p-4 shadow-sm ${active ? palette + " text-white" : "bg-white"}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-2xl ${active ? "bg-white/15" : "bg-neutral-100"} p-2`}>{active ? <CheckCircle2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-neutral-400" />}</div>
        <div>
          <div className={`text-sm font-semibold ${active ? "" : "text-neutral-800"}`}>{label}</div>
          <div className={`text-xs ${active ? "opacity-90" : "text-neutral-500"}`}>{desc}</div>
        </div>
      </div>
      {active && (<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 10 }} className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20" />)}
    </div>
  );
}
