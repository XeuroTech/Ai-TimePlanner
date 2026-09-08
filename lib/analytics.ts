/**
 * The single derivation layer behind the Analytics tab, the Study Stats screen
 * and the summary cards on Home.
 *
 * Nothing here holds state. Everything is computed from what the user has
 * already entered — classes and daily-plan items (`store/planner-store`) plus
 * the habit log (`store/habits-store`). Keeping it as pure functions means the
 * numbers are identical wherever they are shown and can be unit-tested without
 * mounting a screen.
 *
 * Three timestamps drive every metric:
 *   - `PlanTask.completedAt` / `PlanItem.completedAt` — when work was finished
 *   - `HabitLog[habitId][dateKey]`                    — what was logged per day
 *   - `PlanClass.start/end`                           — scheduled minutes
 */
import { toDateKey } from '@/lib/time';
import {
  buildHabitProgress,
  type Habit,
  type HabitLog,
  type HabitProgress,
} from '@/store/habits-store';
import type { PlanClass, PlanItem, PlanTask, Priority } from '@/store/planner-store';

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/* -------------------------------------------------------------------------- */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** App weekday for a Date: 0 = Monday … 6 = Sunday. */
export function appWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** The last `n` calendar days ending today, oldest first. */
export function lastNDays(n: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

/** Epoch-ms bounds of the local calendar day containing `d`. */
function dayBounds(d: Date): { start: number; end: number } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

/* -------------------------------------------------------------------------- */
/* Result types                                                               */
/* -------------------------------------------------------------------------- */

export type DayBucket = {
  /** `YYYY-MM-DD`. */
  key: string;
  /** Short weekday label for the chart axis. */
  label: string;
  /** Single letter, for tight 30-day axes. */
  short: string;
  isToday: boolean;
  tasksDone: number;
  plansDone: number;
  habitsDone: number;
  /** Everything completed that day — the value the bar chart plots. */
  total: number;
};

export type SubjectSlice = {
  name: string;
  /** Scheduled minutes per week. */
  minutes: number;
  /** Share of the weekly total, 0..1. */
  share: number;
  color: string;
  /** Tasks attached to this subject. */
  taskTotal: number;
  taskDone: number;
};

export type TaskBreakdown = {
  total: number;
  done: number;
  pending: number;
  completionRate: number;
  byPriority: Record<Priority, { total: number; done: number }>;
};

export type Analytics = {
  /** True once the user has entered anything at all worth charting. */
  hasData: boolean;

  today: {
    key: string;
    plannedItems: number;
    donePlans: number;
    tasksDone: number;
    habitsDone: number;
    habitTotal: number;
    classCount: number;
    classMinutes: number;
    /** Blended 0..1 completion across plans, tasks and habits for today. */
    score: number;
  };

  range: {
    days: number;
    series: DayBucket[];
    total: number;
    average: number;
    best: DayBucket | null;
  };

  tasks: TaskBreakdown;
  subjects: SubjectSlice[];

  classes: {
    weeklyMinutes: number;
    perDay: number[];
    busiestDay: number | null;
    count: number;
  };

  habits: {
    rows: HabitProgress[];
    total: number;
    done: number;
    completion: number;
    bestStreak: number;
    longestEver: number;
  };

  /** Consecutive days, ending today, with at least one completion. */
  activeStreak: number;
};

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

export type AnalyticsInput = {
  classes: PlanClass[];
  tasks: PlanTask[];
  plans: PlanItem[];
  habits: Habit[];
  habitLog: HabitLog;
  /** How many days the trend chart covers. */
  days?: number;
  now?: Date;
  /** Palette accents, injected so this module stays theme-agnostic. */
  colors?: string[];
};

const FALLBACK_COLORS = ['#6C4DFF', '#4DA3FF', '#4CD964', '#FFB648', '#FF6FAE', '#8B7DFF'];

const EMPTY_PRIORITY: Record<Priority, { total: number; done: number }> = {
  High: { total: 0, done: 0 },
  Medium: { total: 0, done: 0 },
  Low: { total: 0, done: 0 },
};

/* -------------------------------------------------------------------------- */
/* Computation                                                                */
/* -------------------------------------------------------------------------- */

export function computeAnalytics({
  classes,
  tasks,
  plans,
  habits,
  habitLog,
  days = 7,
  now = new Date(),
  colors = FALLBACK_COLORS,
}: AnalyticsInput): Analytics {
  const todayKey = toDateKey(now);

  /* --- daily series ------------------------------------------------------ */

  const habitTargets = new Map(habits.map((h) => [h.id, Math.max(1, h.target)]));

  const series: DayBucket[] = lastNDays(days, now).map((date) => {
    const key = toDateKey(date);
    const { start, end } = dayBounds(date);
    const inDay = (at?: number) => typeof at === 'number' && at >= start && at < end;

    const tasksDone = tasks.filter((t) => t.done && inDay(t.completedAt)).length;
    const plansDone = plans.filter((p) => p.done && inDay(p.completedAt)).length;

    let habitsDone = 0;
    for (const [id, target] of habitTargets) {
      if ((habitLog[id]?.[key] ?? 0) >= target) habitsDone += 1;
    }

    const label = WEEKDAY_LABELS[appWeekday(date)];
    return {
      key,
      label,
      short: label.charAt(0),
      isToday: key === todayKey,
      tasksDone,
      plansDone,
      habitsDone,
      total: tasksDone + plansDone + habitsDone,
    };
  });

  const rangeTotal = series.reduce((sum, d) => sum + d.total, 0);
  const best = series.reduce<DayBucket | null>(
    (top, d) => (d.total > 0 && (!top || d.total > top.total) ? d : top),
    null,
  );

  /* --- tasks ------------------------------------------------------------- */

  const byPriority: Record<Priority, { total: number; done: number }> = {
    High: { ...EMPTY_PRIORITY.High },
    Medium: { ...EMPTY_PRIORITY.Medium },
    Low: { ...EMPTY_PRIORITY.Low },
  };
  for (const t of tasks) {
    const bucket = byPriority[t.priority] ?? byPriority.Medium;
    bucket.total += 1;
    if (t.done) bucket.done += 1;
  }
  const tasksDoneTotal = tasks.filter((t) => t.done).length;
  const taskBreakdown: TaskBreakdown = {
    total: tasks.length,
    done: tasksDoneTotal,
    pending: tasks.length - tasksDoneTotal,
    completionRate: tasks.length ? tasksDoneTotal / tasks.length : 0,
    byPriority,
  };

  /* --- classes & subjects ------------------------------------------------ */

  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const subjectMinutes = new Map<string, number>();
  const subjectColor = new Map<string, string>();

  for (const c of classes) {
    const minutes = Math.max(0, c.end - c.start);
    const day = ((c.day % 7) + 7) % 7;
    perDay[day] += minutes;
    subjectMinutes.set(c.subject, (subjectMinutes.get(c.subject) ?? 0) + minutes);
    if (!subjectColor.has(c.subject)) subjectColor.set(c.subject, c.color);
  }

  const weeklyMinutes = perDay.reduce((a, b) => a + b, 0);
  const busiestDay = weeklyMinutes > 0 ? perDay.indexOf(Math.max(...perDay)) : null;

  // Tasks contribute their subject even when no class exists for it, so the
  // breakdown reflects everything the user actually tracks.
  const taskBySubject = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const name = t.subject || 'General';
    const row = taskBySubject.get(name) ?? { total: 0, done: 0 };
    row.total += 1;
    if (t.done) row.done += 1;
    taskBySubject.set(name, row);
  }

  const subjectNames = new Set([...subjectMinutes.keys(), ...taskBySubject.keys()]);
  const subjects: SubjectSlice[] = [...subjectNames]
    .map((name, i) => {
      const minutes = subjectMinutes.get(name) ?? 0;
      const t = taskBySubject.get(name) ?? { total: 0, done: 0 };
      return {
        name,
        minutes,
        share: weeklyMinutes ? minutes / weeklyMinutes : 0,
        color: subjectColor.get(name) ?? colors[i % colors.length],
        taskTotal: t.total,
        taskDone: t.done,
      };
    })
    .sort((a, b) => b.minutes - a.minutes || b.taskTotal - a.taskTotal);

  /* --- habits ------------------------------------------------------------ */

  const habitRows = buildHabitProgress(habits, habitLog, todayKey);
  const habitsDoneToday = habitRows.filter((r) => r.done).length;
  const habitCompletion = habitRows.length
    ? habitRows.reduce((sum, r) => sum + r.pct, 0) / habitRows.length
    : 0;

  /* --- today ------------------------------------------------------------- */

  const todaysPlans = plans.filter((p) => p.date === todayKey);
  const donePlans = todaysPlans.filter((p) => p.done).length;
  const todayIndex = appWeekday(now);
  const todaysClasses = classes.filter((c) => c.day === todayIndex);
  const todayClassMinutes = todaysClasses.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);
  const tasksDoneToday = series[series.length - 1]?.tasksDone ?? 0;

  // Average the parts that actually exist, so a user with no habits isn't
  // permanently capped at 50%.
  const parts: number[] = [];
  if (todaysPlans.length) parts.push(donePlans / todaysPlans.length);
  if (habitRows.length) parts.push(habitCompletion);
  if (taskBreakdown.total) parts.push(taskBreakdown.completionRate);
  const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;

  /* --- active streak ----------------------------------------------------- */

  const activeStreak = computeActiveStreak(tasks, plans, habits, habitLog, now);

  const hasData =
    classes.length > 0 || tasks.length > 0 || plans.length > 0 || habits.length > 0;

  return {
    hasData,
    today: {
      key: todayKey,
      plannedItems: todaysPlans.length,
      donePlans,
      tasksDone: tasksDoneToday,
      habitsDone: habitsDoneToday,
      habitTotal: habitRows.length,
      classCount: todaysClasses.length,
      classMinutes: todayClassMinutes,
      score,
    },
    range: {
      days,
      series,
      total: rangeTotal,
      average: series.length ? rangeTotal / series.length : 0,
      best,
    },
    tasks: taskBreakdown,
    subjects,
    classes: {
      weeklyMinutes,
      perDay,
      busiestDay,
      count: classes.length,
    },
    habits: {
      rows: habitRows,
      total: habitRows.length,
      done: habitsDoneToday,
      completion: habitCompletion,
      bestStreak: habitRows.reduce((max, r) => Math.max(max, r.streak), 0),
      longestEver: habitRows.reduce((max, r) => Math.max(max, r.bestStreak), 0),
    },
    activeStreak,
  };
}

const MAX_STREAK_LOOKBACK = 365;

/**
 * Days in a row (ending today) with at least one completion of any kind.
 *
 * As with habit streaks, a still-empty *today* doesn't break the run — the day
 * isn't over yet — so counting falls back to yesterday in that case.
 */
function computeActiveStreak(
  tasks: PlanTask[],
  plans: PlanItem[],
  habits: Habit[],
  habitLog: HabitLog,
  now: Date,
): number {
  const targets = habits.map((h) => [h.id, Math.max(1, h.target)] as const);

  const wasActive = (date: Date): boolean => {
    const { start, end } = dayBounds(date);
    const key = toDateKey(date);
    const inDay = (at?: number) => typeof at === 'number' && at >= start && at < end;
    if (tasks.some((t) => t.done && inDay(t.completedAt))) return true;
    if (plans.some((p) => p.done && inDay(p.completedAt))) return true;
    return targets.some(([id, target]) => (habitLog[id]?.[key] ?? 0) >= target);
  };

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!wasActive(cursor)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  for (let i = 0; i < MAX_STREAK_LOOKBACK; i += 1) {
    if (!wasActive(cursor)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** `3h 20m` / `45m` / `0m` — for scheduled-time summaries. */
export function formatMinutesTotal(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** `72%` from a 0..1 ratio. */
export function formatPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

export const WEEKDAY_SHORT = WEEKDAY_LABELS;
