export type Goal = {
  id: string;
  title: string;
  picked: boolean;
  completed: boolean;

  // NEW — optional so old data still works
  trackDaily?: boolean; // when true, completion is driven by daily[]
  daily?: boolean[]; // length=7, Monday .. Sunday
};
export type Category = {
  id: string;
  name: string;
  goals: Goal[];
  colorKey?: PaletteKey;
};
export type Profile = {
  name: string;
  age: number | "";
  sex: "Male" | "Female" | "Other" | "";
  email?: string;
  bloodGroup?: string;
  maritalStatus?: "Single" | "Married" | "Other" | "";
  occupation?: "Job" | "Business" | "Student" | "Other" | "";
  photoUrl?: string;
};

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function startOfWeekKolkata(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const wd = new Intl.DateTimeFormat("en", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = map[wd as keyof typeof map] ?? 0;
  const local = new Date(Date.UTC(y, m - 1, d));
  local.setUTCDate(local.getUTCDate() - offset);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  );
}

export function fmtDateUTCYYYYMMDD(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const PALETTES: Record<
  string,
  { col: string; chip: string; border: string; heading: string }
> = {
  health: {
    col: "bg-gradient-to-br from-emerald-100 to-emerald-200",
    chip: "bg-emerald-600 text-white",
    border: "border-emerald-300",
    heading: "text-emerald-900",
  },
  learning: {
    col: "bg-gradient-to-br from-sky-100 to-indigo-200",
    chip: "bg-indigo-600 text-white",
    border: "border-indigo-300",
    heading: "text-indigo-900",
  },
  career: {
    col: "bg-gradient-to-br from-amber-100 to-orange-200",
    chip: "bg-amber-600 text-white",
    border: "border-amber-300",
    heading: "text-amber-900",
  },
  relation: {
    col: "bg-gradient-to-br from-rose-100 to-pink-200",
    chip: "bg-rose-600 text-white",
    border: "border-rose-300",
    heading: "text-rose-900",
  },
  finance: {
    col: "bg-gradient-to-br from-teal-100 to-emerald-200",
    chip: "bg-teal-600 text-white",
    border: "border-teal-300",
    heading: "text-teal-900",
  },
  fun: {
    col: "bg-gradient-to-br from-violet-100 to-fuchsia-200",
    chip: "bg-fuchsia-600 text-white",
    border: "border-fuchsia-300",
    heading: "text-fuchsia-900",
  },
};
export function paletteFor(name: string, hint?: PaletteKey) {
  if (hint && NAMED_PALETTES[hint]) return NAMED_PALETTES[hint];
  const key = name.toLowerCase();
  if (key.includes("health") || key.includes("energy")) return PALETTES.health;
  if (key.includes("learn") || key.includes("growth")) return PALETTES.learning;
  if (key.includes("career") || key.includes("craft")) return PALETTES.career;
  if (key.includes("relation")) return PALETTES.relation;
  if (key.includes("finance") || key.includes("money")) return PALETTES.finance;
  return PALETTES.fun;
}

export const DEFAULT_DATA: Category[] = [
  {
    id: uid(),
    name: "Health & Energy",
    goals: [
      { id: uid(), title: "30-min workout", picked: false, completed: false },
      { id: uid(), title: "Sleep 7+ hours", picked: false, completed: false },
      { id: uid(), title: "10k steps", picked: false, completed: false },
      { id: uid(), title: "Meditate 10 min", picked: false, completed: false },
    ],
  },
  {
    id: uid(),
    name: "Learning & Growth",
    goals: [
      { id: uid(), title: "Read 20 pages", picked: false, completed: false },
      { id: uid(), title: "Course lesson", picked: false, completed: false },
      { id: uid(), title: "Write notes", picked: false, completed: false },
    ],
  },
  {
    id: uid(),
    name: "Career & Craft",
    goals: [
      { id: uid(), title: "Deep work (90m)", picked: false, completed: false },
      { id: uid(), title: "Ship a task", picked: false, completed: false },
      { id: uid(), title: "Mentor someone", picked: false, completed: false },
    ],
  },
  {
    id: uid(),
    name: "Relationships",
    goals: [
      { id: uid(), title: "Quality time", picked: false, completed: false },
      { id: uid(), title: "Call a friend", picked: false, completed: false },
      { id: uid(), title: "Acts of kindness", picked: false, completed: false },
    ],
  },
  {
    id: uid(),
    name: "Finance",
    goals: [
      { id: uid(), title: "Track expenses", picked: false, completed: false },
      { id: uid(), title: "No-spend day", picked: false, completed: false },
      { id: uid(), title: "Invest/Plan", picked: false, completed: false },
    ],
  },
  {
    id: uid(),
    name: "Fun & Spirit",
    goals: [
      { id: uid(), title: "Hobby session", picked: false, completed: false },
      { id: uid(), title: "Get outdoors", picked: false, completed: false },
      {
        id: uid(),
        title: "Gratitude journal",
        picked: false,
        completed: false,
      },
    ],
  },
];

// ⬇️ NEW: export a palette key type and a map the UI expects
export type PaletteKey =
  | "emerald"
  | "rose"
  | "teal"
  | "indigo"
  | "violet"
  | "amber"
  | "lime"
  | "fuchsia"
  | "sky";

const NAMED_PALETTES: Record<
  PaletteKey,
  {
    border: string;
    col: string;
    heading: string;
    chip: string;
  }
> = {
  emerald: {
    border: "border-emerald-200",
    col: "bg-emerald-50/60",
    heading: "text-emerald-900",
    chip: "bg-emerald-100 text-emerald-900",
  },
  rose: {
    border: "border-rose-200",
    col: "bg-rose-50/60",
    heading: "text-rose-900",
    chip: "bg-rose-100 text-rose-900",
  },
  teal: {
    border: "border-teal-200",
    col: "bg-teal-50/60",
    heading: "text-teal-900",
    chip: "bg-teal-100 text-teal-900",
  },
  indigo: {
    border: "border-indigo-200",
    col: "bg-indigo-50/60",
    heading: "text-indigo-900",
    chip: "bg-indigo-100 text-indigo-900",
  },
  violet: {
    border: "border-violet-200",
    col: "bg-violet-50/60",
    heading: "text-violet-900",
    chip: "bg-violet-100 text-violet-900",
  },
  amber: {
    border: "border-amber-200",
    col: "bg-amber-50/60",
    heading: "text-amber-900",
    chip: "bg-amber-100 text-amber-900",
  },
  lime: {
    border: "border-lime-200",
    col: "bg-lime-50/60",
    heading: "text-lime-900",
    chip: "bg-lime-100 text-lime-900",
  },
  fuchsia: {
    border: "border-fuchsia-200",
    col: "bg-fuchsia-50/60",
    heading: "text-fuchsia-900",
    chip: "bg-fuchsia-100 text-fuchsia-900",
  },
  sky: {
    border: "border-sky-200",
    col: "bg-sky-50/60",
    heading: "text-sky-900",
    chip: "bg-sky-100 text-sky-900",
  },
};
