import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  CalendarDays,
  CheckCircle2,
  Lock,
  CalendarClock,
  Rocket,
  Sparkles,
  Trophy,
  Plus,
} from "lucide-react";

import Toast from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import MilestoneCard from "./components/MilestoneCard";
import SortableGoal from "./components/SortableGoal";

import {
  startOfWeekKolkata,
  fmtDateUTCYYYYMMDD,
  paletteFor,
  Category,
} from "./lib/core";
import { loadWeekData, saveWeekData, ensureFirebase } from "./lib/store";
import ProfilePage from "./pages/ProfilePage";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import { generateAIReport } from "./lib/report";

import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

export default function GoalChallengeApp() {
  const [tab, setTab] = useState<"goals" | "profile" | "auth" | "dashboard">(
    "goals"
  );

  // Auth state
  const [authUser, setAuthUser] = useState<any>(null);

  // Profile id (used to scope per-user weekly docs)
  const profileIdKey = "goal-challenge:profileId";
  const [profileId, setProfileId] = useState<string>(() => {
    const ex = localStorage.getItem(profileIdKey);
    if (ex) return ex;
    const id = Math.random().toString(36).slice(2, 9);
    localStorage.setItem(profileIdKey, id);
    return id;
  });

  // Wire Firebase Auth listener
  useEffect(() => {
    ensureFirebase();
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      if (u?.uid) setProfileId(u.uid);
      else {
        const anon = localStorage.getItem(profileIdKey);
        if (anon) setProfileId(anon);
      }
    });
    return () => unsub();
  }, []);

  // Week handling
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekKolkata());
  const weekStamp = useMemo(() => fmtDateUTCYYYYMMDD(weekStart), [weekStart]);
  const currentWeekStart = useMemo(() => startOfWeekKolkata(), []);
  const isPast = weekStart.getTime() < currentWeekStart.getTime();
  const isFuture = weekStart.getTime() > currentWeekStart.getTime();

  // Week data state (per-week persistence) — start empty to avoid saving wrong week on first render
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const hydratingRef = useRef(false);
  const saveTimer = useRef<number | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Pretty confirm dialog state & helpers
  const [confirmDel, setConfirmDel] = useState<{
    open: boolean;
    catId?: string;
    goalId?: string;
    title?: string;
  }>({ open: false });
  const requestDelete = (catId: string, goalId: string, title: string) => {
    if (isPast) return; // safety
    setConfirmDel({ open: true, catId, goalId, title });
  };
  const confirmDelete = () => {
    if (confirmDel.catId && confirmDel.goalId)
      deleteGoal(confirmDel.catId, confirmDel.goalId);
    setConfirmDel({ open: false });
  };

  // Add/Rename helpers and input state
  const [newGoalText, setNewGoalText] = useState<Record<string, string>>({});
  const addGoal = (catId: string, title: string) => {
    if (isPast) return; // no edits in the past
    if (!title) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              goals: [
                ...c.goals,
                {
                  id:
                    crypto.randomUUID?.() ||
                    Math.random().toString(36).slice(2, 9),
                  title,
                  picked: false,
                  completed: false,
                },
              ],
            }
      )
    );
    setNewGoalText((prev) => ({ ...prev, [catId]: "" }));
  };
  const renameGoal = (catId: string, goalId: string, newTitle: string) => {
    if (isPast) return; // no edits in the past
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              goals: c.goals.map((g) =>
                g.id !== goalId ? g : { ...g, title: newTitle }
              ),
            }
      )
    );
  };
  const duplicateGoal = (catId: string, goalId: string) => {
    if (isPast) return; // no edits in the past
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        const g = c.goals.find((x) => x.id === goalId);
        if (!g) return c;
        return {
          ...c,
          goals: [
            ...c.goals,
            {
              id:
                crypto.randomUUID?.() || Math.random().toString(36).slice(2, 9),
              title: g.title + " (copy)",
              picked: false,
              completed: false,
            },
          ],
        };
      })
    );
  };
  const deleteGoal = (catId: string, goalId: string) => {
    if (isPast) return; // no edits in the past
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              goals: c.goals.filter((g) => g.id !== goalId),
            }
      )
    );
  };

  // Load week from storage/Firestore whenever week changes OR profile changes
  useEffect(() => {
    let alive = true;
    (async () => {
      hydratingRef.current = true;
      setLoadingWeek(true);
      try {
        const data = await loadWeekData(profileId, weekStamp);
        if (!alive) return;
        setCategories(data);
      } finally {
        hydratingRef.current = false;
        setLoadingWeek(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId, weekStamp]);

  // Save week to storage/Firestore when categories change (but not while hydrating)
  useEffect(() => {
    if (hydratingRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveWeekData(profileId, weekStamp, categories);
    }, 300);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [categories, profileId, weekStamp]);

  // Stats & Milestones
  const achievedPerCategory = categories.map(
    (c) => c.goals.filter((g) => g.completed).length >= 2
  );
  const achievedCount = achievedPerCategory.filter(Boolean).length;
  const milestoneLevel =
    achievedCount === 6
      ? "brilliant"
      : achievedCount >= 4
      ? "rocking"
      : achievedCount >= 2
      ? "right"
      : "none";
  const prevLevel = useRef<string>("none");
  const [toast, setToast] = useState<{
    show: boolean;
    title: string;
    subtitle?: string;
  }>({ show: false, title: "", subtitle: "" });
  useEffect(() => {
    if (
      !isPast &&
      milestoneLevel !== "none" &&
      milestoneLevel !== prevLevel.current
    ) {
      prevLevel.current = milestoneLevel;
      const map = {
        right: {
          title: "You're on the right track!",
          sub: "2 categories done. Keep the momentum!",
        },
        rocking: {
          title: "You're rocking it!",
          sub: "2 goals in 4+ categories. Outstanding!",
        },
        brilliant: {
          title: "Brilliant week!",
          sub: "2 goals in every category. You're unstoppable!",
        },
      } as const;
      const m = map[milestoneLevel as keyof typeof map];
      setToast({ show: true, title: m.title, subtitle: m.sub });
    }
  }, [milestoneLevel, isPast]);

  // Handlers with time-guard rules
  const onDragEnd = (e: DragEndEvent) => {
    if (isPast) return; // past weeks are read-only
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const findCatByGoal = (goalId: string) =>
      categories.find((c) => c.goals.some((g) => g.id === goalId));
    const srcCat = findCatByGoal(String(active.id));
    const dstCat = findCatByGoal(String(over.id));
    if (!srcCat || !dstCat || srcCat.id !== dstCat.id) return;
    const catIdx = categories.findIndex((c) => c.id === srcCat.id);
    const srcGoals = srcCat.goals;
    const oldIndex = srcGoals.findIndex((g) => g.id === active.id);
    const newIndex = srcGoals.findIndex((g) => g.id === over.id);
    const newGoals = arrayMove(srcGoals, oldIndex, newIndex);
    const next = [...categories];
    next[catIdx] = { ...srcCat, goals: newGoals };
    setCategories(next);
  };
  const togglePicked = (catId: string, goalId: string) => {
    if (isPast) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              goals: c.goals.map((g) =>
                g.id !== goalId ? g : { ...g, picked: !g.picked }
              ),
            }
      )
    );
  };
  const toggleCompleted = (catId: string, goalId: string) => {
    if (isPast || isFuture) return;
    const cat = categories.find((c) => c.id === catId);
    const goal = cat?.goals.find((g) => g.id === goalId);
    if (goal?.trackDaily) return; // completion is derived from daily dots

    const willComplete = !!goal && !goal.completed;
    const goalTitle = goal?.title || "Goal";
    const catName = cat?.name || "";
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              goals: c.goals.map((g) =>
                g.id !== goalId ? g : { ...g, completed: !g.completed }
              ),
            }
      )
    );
    if (willComplete) {
      setToast({
        show: true,
        title: "Nice! Task completed",
        subtitle: catName ? `${goalTitle} — ${catName}` : goalTitle,
      });
    }
  };

  // --- Daily-tracking helpers ---
  const ensureDaily = (arr?: boolean[]) =>
    Array.isArray(arr) && arr.length === 7
      ? arr.slice()
      : new Array(7).fill(false);
  const isSeven = (arr?: boolean[]) =>
    Array.isArray(arr) && arr.filter(Boolean).length === 7;

  const toggleTrackDaily = (catId: string, goalId: string) => {
    if (isPast) return; // no edits in past
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          goals: c.goals.map((g) => {
            if (g.id !== goalId) return g;
            const nextTrack = !g.trackDaily;
            const daily = ensureDaily(g.daily);
            // If turning ON and already 7/7, Completed should reflect it
            const completed = nextTrack ? isSeven(daily) : g.completed;
            return { ...g, trackDaily: nextTrack, daily, completed };
          }),
        };
      })
    );
  };

  const toggleDay = (catId: string, goalId: string, idx: number) => {
    if (isPast || isFuture) return; // progress only in current week
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          goals: c.goals.map((g) => {
            if (g.id !== goalId) return g;
            const daily = ensureDaily(g.daily);
            const wasOn = !!daily[idx];
            daily[idx] = !daily[idx];

            // short motivating toast when a single day is ticked
            const turnedOn = !wasOn && daily[idx];
            const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
              idx
            ];
            // (We’ll avoid double toast when the 7th check also completes the streak)
            if (turnedOn && !isSeven(daily)) {
              const goalTitle = g.title || "Goal";
              const catName = c.name || "";
              setToast({
                show: true,
                title: `Nice! ${dayName} done`,
                subtitle: catName ? `${goalTitle} — ${catName}` : goalTitle,
              });
            }

            // 1) Auto-pick if any day turned on (never auto-unpick)
            const picked = g.picked || (!wasOn && daily[idx]);

            // 2) Completed mirrors 7/7 only when tracking is ON (auto-check & auto-uncheck)
            let completed = g.completed;
            if (g.trackDaily) {
              const nowSeven = isSeven(daily);
              if (nowSeven && !completed) {
                completed = true;
                setToast({
                  show: true,
                  title: "Daily streak complete!",
                  subtitle: `${g.title || "Goal"} — 7/7`,
                });
              } else if (!nowSeven && completed) {
                completed = false; // you asked to auto-uncheck when dropping below 7
              }
            }

            return { ...g, daily, picked, completed };
          }),
        };
      })
    );
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekStart(d);
  };
  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setUTCDate(end.getUTCDate() + 6);
    const intl = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "2-digit",
    });
    return `${intl.format(weekStart)} → ${intl.format(end)}`;
  }, [weekStart]);

  const modeInfo = isPast
    ? {
        text: "Past week — read only",
        color: "bg-neutral-800",
        icon: <Lock className="h-4 w-4" />,
      }
    : isFuture
    ? {
        text: "Future week — picking only (no completion)",
        color: "bg-indigo-600",
        icon: <CalendarClock className="h-4 w-4" />,
      }
    : {
        text: "Current week — full access",
        color: "bg-emerald-600",
        icon: <CheckCircle2 className="h-4 w-4 text-white" />,
      };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_0%,#eef2ff_0%,transparent_60%),radial-gradient(1200px_600px_at_90%_100%,#ecfeff_0%,transparent_60%)] bg-slate-50 p-5">
      <div className="mx-auto max-w-[1400px]">
        {/* Top Nav */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-300 bg-white p-1 shadow-sm">
            <button
              onClick={() => setTab("goals")}
              className={`rounded-xl px-3 py-1.5 text-sm ${
                tab === "goals" ? "bg-black text-white" : "hover:bg-neutral-100"
              }`}
            >
              Goals
            </button>
            <button
              onClick={() => setTab("profile")}
              className={`rounded-xl px-3 py-1.5 text-sm ${
                tab === "profile"
                  ? "bg-black text-white"
                  : "hover:bg-neutral-100"
              }`}
            >
              Profile
            </button>

            <button
              onClick={() => setTab("dashboard")}
              className={`rounded-xl px-3 py-1.5 text-sm ${
                tab === "dashboard"
                  ? "bg-black text-white"
                  : "hover:bg-neutral-100"
              }`}
            >
              Dashboard
            </button>

            {!authUser && (
              <button
                onClick={() => setTab("auth")}
                className={`rounded-xl px-3 py-1.5 text-sm ${
                  tab === "auth"
                    ? "bg-black text-white"
                    : "hover:bg-neutral-100"
                }`}
              >
                Account
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {tab === "goals" && (
              <>
                <button
                  onClick={() => shiftWeek(-1)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-neutral-50"
                >
                  ◀ Prev
                </button>
                <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm">
                  <CalendarDays className="h-4 w-4" />
                  <span className="tabular-nums">{weekLabel}</span>
                </div>
                <button
                  onClick={() => shiftWeek(1)}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-neutral-50"
                >
                  Next ▶
                </button>
              </>
            )}
            {authUser ? (
              <div className="ml-3 flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs shadow-sm">
                <span className="max-w-[180px] truncate">
                  {authUser.displayName || authUser.email}
                </span>
                <button
                  onClick={() => signOut(getAuth())}
                  className="rounded-lg px-2 py-1 hover:bg-neutral-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setTab("auth")}
                className="ml-2 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-neutral-50"
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {tab === "goals" ? (
          <>
            {/* Intro hero */}
            <div className="mt-2 mb-3">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                The Goal Challenge!
              </h1>
              <p className="mt-1 text-sm md:text-base text-neutral-700">
                Select any 2 goals from each category to follow and make your
                entire week exciting.
              </p>
            </div>

            {/* Milestones explainer */}
            <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-100 p-3">
                <div className="rounded-xl bg-emerald-600/90 p-2 text-white">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-emerald-900">
                    Brilliant
                  </div>
                  <div className="text-xs text-emerald-800/80">
                    If you have completed{" "}
                    <span className="font-semibold">2 activities</span> from{" "}
                    <span className="font-semibold">all 6 categories</span>.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-fuchsia-100 p-3">
                <div className="rounded-xl bg-indigo-600/90 p-2 text-white">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-indigo-900">
                    You rock
                  </div>
                  <div className="text-xs text-indigo-800/80">
                    If you have completed{" "}
                    <span className="font-semibold">2 activities</span> from{" "}
                    <span className="font-semibold">4 categories</span>.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-3">
                <div className="rounded-xl bg-amber-500/90 p-2 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-amber-900">
                    You're on the right track
                  </div>
                  <div className="text-xs text-amber-800/80">
                    If you have completed{" "}
                    <span className="font-semibold">2 activities</span> from{" "}
                    <span className="font-semibold">2 categories</span>.
                  </div>
                </div>
              </div>
            </div>

            {/* Mode badge */}
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white ${modeInfo.color}`}
              >
                {modeInfo.icon}
                {modeInfo.text}
              </span>
            </div>

            {/* Milestones */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <MilestoneCard
                level="right"
                active={achievedCount >= 2}
                label="On the Right Track"
                desc="2 categories with 2 completed"
              />
              <MilestoneCard
                level="rocking"
                active={achievedCount >= 4}
                label="Rocking"
                desc="4 categories with 2 completed"
              />
              <MilestoneCard
                level="brilliant"
                active={achievedCount === 6}
                label="Brilliant"
                desc="All 6 categories achieved"
              />
            </div>

            {/* Columns */}
            {loadingWeek ? (
              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-56 animate-pulse rounded-3xl border border-neutral-200 bg-white/60"
                  />
                ))}
              </div>
            ) : (
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {categories.map((cat) => {
                    const pal = paletteFor(cat.name);
                    return (
                      <div
                        key={cat.id}
                        className={`rounded-3xl border ${pal.border} ${pal.col} p-4 shadow-md`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h2
                            className={`text-lg font-semibold tracking-tight ${pal.heading}`}
                          >
                            {cat.name}
                          </h2>
                          <span
                            className={`text-xs inline-flex items-center gap-2 rounded-full px-2 py-1 ${pal.chip}`}
                          >
                            {cat.goals.filter((g) => g.completed).length}/2
                            completed
                          </span>
                        </div>
                        <SortableContext
                          items={cat.goals.map((g) => g.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="flex flex-col gap-3">
                            {cat.goals.map((goal) => (
                              <SortableGoal
                                key={goal.id}
                                goal={goal}
                                disabledDrag={isPast}
                                disabledPick={isPast}
                                disabledComplete={isPast || isFuture}
                                onTogglePicked={() =>
                                  togglePicked(cat.id, goal.id)
                                }
                                onToggleCompleted={() =>
                                  toggleCompleted(cat.id, goal.id)
                                }
                                onRename={(newTitle) =>
                                  renameGoal(cat.id, goal.id, newTitle)
                                }
                                onDuplicate={() =>
                                  duplicateGoal(cat.id, goal.id)
                                }
                                onDelete={() =>
                                  requestDelete(cat.id, goal.id, goal.title)
                                }
                                disabledRename={isPast}
                                disabledManage={isPast}
                                // NEW
                                onToggleTrackDaily={() =>
                                  toggleTrackDaily(cat.id, goal.id)
                                }
                                onToggleDay={(i) =>
                                  toggleDay(cat.id, goal.id, i)
                                }
                                disableDayChecks={isPast || isFuture}
                              />
                            ))}
                          </div>
                        </SortableContext>

                        {/* Add new goal */}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={newGoalText[cat.id] || ""}
                            onChange={(e) =>
                              setNewGoalText((prev) => ({
                                ...prev,
                                [cat.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                addGoal(
                                  cat.id,
                                  (newGoalText[cat.id] || "").trim()
                                );
                              }
                            }}
                            placeholder="Add a new goal"
                            disabled={isPast}
                            className={`flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm ${
                              isPast ? "opacity-50" : ""
                            }`}
                          />
                          <button
                            onClick={() =>
                              addGoal(
                                cat.id,
                                (newGoalText[cat.id] || "").trim()
                              )
                            }
                            disabled={isPast}
                            className={`inline-flex items-center gap-1 rounded-xl bg-black px-3 py-2 text-xs text-white shadow-sm ${
                              isPast
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-neutral-800"
                            }`}
                            title={
                              isPast
                                ? "Cannot add goals in past weeks"
                                : "Add goal"
                            }
                          >
                            <Plus className="h-4 w-4" /> Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DndContext>
            )}
          </>
        ) : tab === "profile" ? (
          <ProfilePage />
        ) : tab === "dashboard" ? (
          <DashboardPage
            categories={categories}
            weekLabel={weekLabel}
            weekStamp={weekStamp}
            profile={{
              name: authUser?.displayName || null,
              email: authUser?.email || null,
            }}
            profileId={profileId}
            onGenerateReport={async () =>
              await generateAIReport({
                weekStamp,
                profile: {
                  name: authUser?.displayName || null,
                  email: authUser?.email || null,
                },
                categories,
              })
            }
          />
        ) : (
          <div>
            {authUser ? (
              <div className="rounded-3xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700 shadow-sm">
                You're signed in as{" "}
                <span className="font-medium">
                  {authUser.displayName || authUser.email}
                </span>
                .
              </div>
            ) : null}
            <div className="mt-4">
              <AuthPage onSignedIn={() => setTab("goals")} />
            </div>
          </div>
        )}

        <div className="mt-10 text-center text-xs text-neutral-500">
          Week starts on <span className="font-medium">Monday</span>. Your
          progress is saved per week — in the cloud when Firebase is configured,
          otherwise locally on this device.
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel.open}
        title="Delete this goal?"
        description={
          confirmDel.title
            ? `This will remove "${confirmDel.title}" from this week.`
            : undefined
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDel({ open: false })}
      />

      <Toast
        show={toast.show}
        title={toast.title}
        subtitle={toast.subtitle}
        onClose={() => setToast((s) => ({ ...s, show: false }))}
      />
    </div>
  );
}
