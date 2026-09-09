/**
 * Habit tracker state.
 *
 * `app/habits.tsx` used to hold its habits in local `useState` seeded from an
 * empty array with a "TODO(backend)" note, so nothing could be added and every
 * increment was lost on unmount. Habits now live here, persisted, and — more
 * importantly — every increment is written to a **per-day log**. That log is
 * what gives the Analytics tab something real to chart; without it there is no
 * history to compute streaks or trends from.
 *
 * Shape of the log is `habitId -> 'YYYY-MM-DD' -> value logged that day`, which
 * keeps a day's entry O(1) to read and makes the whole thing trivially
 * serialisable into AsyncStorage.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import { toDateKey } from '@/lib/time';
import { useAuthStore } from '@/store/auth-store';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Keys into the palette/tint maps, so habits re-theme with dark mode.
 * `'custom'` opts out of re-theming — `customColor` is a fixed hex instead.
 */
export type HabitColorKey = 'primary' | 'blue' | 'green' | 'orange' | 'pink' | 'custom';

/**
 * `'counter'` — tap adds `step` toward `target` (e.g. 8 glasses of water).
 * `'checkbox'` — a single tap marks it done for the day; no partial progress.
 * Chosen explicitly when the habit is created, not inferred from `unit`.
 */
export type HabitKind = 'counter' | 'checkbox';

export type Habit = {
  id: string;
  uid: string;
  name: string;
  /** Ionicon name. */
  icon: string;
  colorKey: HabitColorKey;
  /** Hex color, used when `colorKey === 'custom'`. */
  customColor?: string;
  kind: HabitKind;
  /** Display unit, e.g. `glasses`, `min`, `pages`. Ignored for `'checkbox'` habits. */
  unit: string;
  /** How much one tap adds. Always 1 for `'checkbox'` habits. */
  step: number;
  /** Value that counts as "done for today". Always 1 for `'checkbox'` habits. */
  target: number;
  createdAt: number;
  archived?: boolean;
};

/** `habitId -> dateKey -> value`. */
export type HabitLog = Record<string, Record<string, number>>;

export type HabitProgress = {
  habit: Habit;
  /** Value logged for the requested day. */
  current: number;
  target: number;
  done: boolean;
  /** 0..1, clamped. */
  pct: number;
  /** Consecutive days met, counting back from the requested day. */
  streak: number;
  /** Longest run ever recorded for this habit. */
  bestStreak: number;
};

type HabitsState = {
  habits: Habit[];
  log: HabitLog;

  addHabit: (input: Omit<Habit, 'id' | 'uid' | 'createdAt'>) => string;
  updateHabit: (id: string, patch: Partial<Omit<Habit, 'id' | 'uid' | 'createdAt'>>) => void;
  removeHabit: (id: string) => void;
  /** Advances a habit by one step; taps past the target wrap back to zero. */
  bumpHabit: (id: string, dateKey?: string) => void;
  /** Retreats a habit by one step (floored at 0) — undoes an accidental tap. */
  decrementHabit: (id: string, dateKey?: string) => void;
  /** Writes an exact value (used by undo / long-press reset). */
  setHabitValue: (id: string, value: number, dateKey?: string) => void;
  clearAll: () => void;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function currentUid(): string {
  return useAuthStore.getState().fbUser?.uid ?? 'anon';
}

function makeId(): string {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Value logged for a habit on a given day (0 when nothing was recorded). */
export function habitValue(log: HabitLog, habitId: string, dateKey: string): number {
  return log[habitId]?.[dateKey] ?? 0;
}

function shiftKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + deltaDays);
  return toDateKey(date);
}

/** Hard stop so a corrupt log can never spin the loop forever. */
const MAX_STREAK_LOOKBACK = 3650;

/**
 * Consecutive days (ending at `endKey`) where the habit hit its target.
 *
 * An unfinished *today* does not break the streak — the day is still in
 * progress, so counting starts from yesterday in that case. Any earlier gap
 * does break it.
 */
export function computeStreak(
  entries: Record<string, number> | undefined,
  target: number,
  endKey: string = toDateKey(),
): number {
  if (!entries || target <= 0) return 0;
  let cursor = endKey;
  if ((entries[cursor] ?? 0) < target) cursor = shiftKey(cursor, -1);

  let streak = 0;
  for (let i = 0; i < MAX_STREAK_LOOKBACK; i += 1) {
    if ((entries[cursor] ?? 0) < target) break;
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

/** Longest run of target-hitting days anywhere in the habit's history. */
export function computeBestStreak(
  entries: Record<string, number> | undefined,
  target: number,
): number {
  if (!entries || target <= 0) return 0;
  const met = Object.keys(entries)
    .filter((k) => (entries[k] ?? 0) >= target)
    .sort();
  if (met.length === 0) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < met.length; i += 1) {
    run = met[i] === shiftKey(met[i - 1], 1) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Progress rows for a set of habits on a given day.
 *
 * Exported as a plain function (not just a hook) so the analytics layer and
 * any future background job can reuse the exact same maths.
 */
export function buildHabitProgress(
  habits: Habit[],
  log: HabitLog,
  dateKey: string = toDateKey(),
): HabitProgress[] {
  return habits.map((habit) => {
    const entries = log[habit.id];
    const current = entries?.[dateKey] ?? 0;
    const target = Math.max(1, habit.target);
    return {
      habit,
      current,
      target,
      done: current >= target,
      pct: Math.max(0, Math.min(1, current / target)),
      streak: computeStreak(entries, target, dateKey),
      bestStreak: computeBestStreak(entries, target),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const useHabitsStore = create<HabitsState>()(
  persist(
    (set) => ({
      habits: [],
      log: {},

      addHabit: (input) => {
        const id = makeId();
        set((s) => ({
          habits: [...s.habits, { ...input, id, uid: currentUid(), createdAt: Date.now() }],
        }));
        return id;
      },

      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        })),

      removeHabit: (id) =>
        set((s) => {
          // Drop the history too, otherwise the log grows forever with orphans.
          const { [id]: _discarded, ...rest } = s.log;
          return { habits: s.habits.filter((h) => h.id !== id), log: rest };
        }),

      bumpHabit: (id, dateKey = toDateKey()) =>
        set((s) => {
          const habit = s.habits.find((h) => h.id === id);
          if (!habit) return s;
          const target = Math.max(1, habit.target);
          const step = Math.max(1, habit.step);
          const current = s.log[id]?.[dateKey] ?? 0;
          // Tapping a completed habit clears it — that is the "undo" gesture.
          const next = current >= target ? 0 : Math.min(current + step, target);
          return { log: { ...s.log, [id]: { ...(s.log[id] ?? {}), [dateKey]: next } } };
        }),

      decrementHabit: (id, dateKey = toDateKey()) =>
        set((s) => {
          const habit = s.habits.find((h) => h.id === id);
          if (!habit) return s;
          const step = Math.max(1, habit.step);
          const current = s.log[id]?.[dateKey] ?? 0;
          const next = Math.max(0, current - step);
          return { log: { ...s.log, [id]: { ...(s.log[id] ?? {}), [dateKey]: next } } };
        }),

      setHabitValue: (id, value, dateKey = toDateKey()) =>
        set((s) => ({
          log: {
            ...s.log,
            [id]: { ...(s.log[id] ?? {}), [dateKey]: Math.max(0, Math.round(value)) },
          },
        })),

      clearAll: () => set({ habits: [], log: {} }),
    }),
    {
      name: '@aip/habits',
      storage: zustandStorage,
      version: 2,
      /** v1 -> v2 added `kind`, inferred from the old unit-emptiness convention. */
      migrate: (persisted, version) => {
        const state = persisted as { habits?: (Habit & { kind?: HabitKind })[]; log?: HabitLog };
        if (version >= 2 || !state) return state;
        return {
          ...state,
          habits: (state.habits ?? []).map((h) => ({
            ...h,
            kind: h.kind ?? (h.unit?.trim() ? 'counter' : 'checkbox'),
          })),
        };
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Selectors (scoped to the signed-in user)                                   */
/* -------------------------------------------------------------------------- */

/*
 * Same rule as planner-store: select the raw array from zustand and filter
 * inside `useMemo`. Filtering in the selector returns a new reference every
 * render and sends useSyncExternalStore into an update loop.
 */

/** Non-archived habits belonging to the current user. */
export function useMyHabits(): Habit[] {
  const uid = useAuthStore((s) => s.fbUser?.uid ?? 'anon');
  const habits = useHabitsStore((s) => s.habits);
  return useMemo(
    () => habits.filter((h) => h.uid === uid && !h.archived),
    [habits, uid],
  );
}

/** Progress rows for the current user's habits on `dateKey` (default today). */
export function useHabitProgress(dateKey: string = toDateKey()): HabitProgress[] {
  const habits = useMyHabits();
  const log = useHabitsStore((s) => s.log);
  return useMemo(() => buildHabitProgress(habits, log, dateKey), [habits, log, dateKey]);
}

/** Headline numbers for the habits hero card and the home summary. */
export function useHabitSummary(dateKey: string = toDateKey()): {
  total: number;
  done: number;
  completion: number;
  bestStreak: number;
} {
  const rows = useHabitProgress(dateKey);
  return useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.done).length;
    const completion = total ? rows.reduce((sum, r) => sum + r.pct, 0) / total : 0;
    const bestStreak = rows.reduce((max, r) => Math.max(max, r.streak), 0);
    return { total, done, completion, bestStreak };
  }, [rows]);
}
