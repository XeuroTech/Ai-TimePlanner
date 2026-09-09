import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import { useAuthStore } from '@/store/auth-store';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Priority = 'High' | 'Medium' | 'Low';

/** A recurring/weekly timetable entry. day: 0 = Monday … 6 = Sunday. */
export type PlanClass = {
  id: string;
  uid: string;
  subject: string;
  day: number;
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  teacher?: string;
  room?: string;
  reminder?: string;
  repeat?: string;
  color: string;
  createdAt: number;
};

export type PlanTask = {
  id: string;
  uid: string;
  title: string;
  subject: string;
  due: string;
  priority: Priority;
  done: boolean;
  createdAt: number;
  /**
   * Epoch ms of the moment this was ticked off, cleared when un-ticked.
   *
   * `done` alone is a snapshot and says nothing about *when* — which makes
   * trends, streaks and "completed today" impossible to compute. Analytics
   * reads this field exclusively; `due` is a free-text label ("Today",
   * "Tomorrow") and is not a reliable date.
   */
  completedAt?: number;
};

/** A single daily-plan item for a given calendar date (YYYY-MM-DD). */
export type PlanItem = {
  id: string;
  uid: string;
  date: string;
  title: string;
  time: number; // minutes from midnight
  note?: string;
  /** Ionicon name chosen when the plan was created; falls back to a default in the UI. */
  icon?: string;
  done: boolean;
  createdAt: number;
  /** Epoch ms of completion — see the note on `PlanTask.completedAt`. */
  completedAt?: number;
};

type PlannerState = {
  classes: PlanClass[];
  tasks: PlanTask[];
  plans: PlanItem[];

  addClass: (input: Omit<PlanClass, 'id' | 'uid' | 'createdAt'>) => void;
  updateClass: (id: string, patch: Partial<Omit<PlanClass, 'id' | 'uid' | 'createdAt'>>) => void;
  removeClass: (id: string) => void;

  addTask: (input: Omit<PlanTask, 'id' | 'uid' | 'createdAt' | 'done'>) => void;
  updateTask: (id: string, patch: Partial<Omit<PlanTask, 'id' | 'uid' | 'createdAt' | 'done' | 'completedAt'>>) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;

  addPlan: (input: Omit<PlanItem, 'id' | 'uid' | 'createdAt' | 'done'>) => void;
  togglePlan: (id: string) => void;
  removePlan: (id: string) => void;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function currentUid(): string {
  return useAuthStore.getState().fbUser?.uid ?? 'anon';
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      classes: [],
      tasks: [],
      plans: [],

      addClass: (input) =>
        set((s) => ({
          classes: [
            ...s.classes,
            { ...input, id: makeId(), uid: currentUid(), createdAt: Date.now() },
          ],
        })),
      updateClass: (id, patch) =>
        set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeClass: (id) => set((s) => ({ classes: s.classes.filter((c) => c.id !== id) })),

      addTask: (input) =>
        set((s) => ({
          tasks: [
            ...s.tasks,
            { ...input, id: makeId(), uid: currentUid(), done: false, createdAt: Date.now() },
          ],
        })),
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      toggleTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, done: !t.done, completedAt: t.done ? undefined : Date.now() } : t,
          ),
        })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      addPlan: (input) =>
        set((s) => ({
          plans: [
            ...s.plans,
            { ...input, id: makeId(), uid: currentUid(), done: false, createdAt: Date.now() },
          ],
        })),
      togglePlan: (id) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === id ? { ...p, done: !p.done, completedAt: p.done ? undefined : Date.now() } : p,
          ),
        })),
      removePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),
    }),
    {
      name: '@aip/planner',
      storage: zustandStorage,
      version: 2,
      /**
       * v1 -> v2 added `completedAt`. Anything already ticked off before the
       * upgrade has no timestamp, so it is backfilled with `createdAt` — that
       * keeps those rows inside the history window instead of silently
       * vanishing from every chart.
       */
      migrate: (persisted, version) => {
        const state = persisted as PlannerState;
        if (version >= 2 || !state) return state;
        const backfill = <T extends { done: boolean; createdAt: number; completedAt?: number }>(
          row: T,
        ): T => (row.done && row.completedAt == null ? { ...row, completedAt: row.createdAt } : row);
        return {
          ...state,
          tasks: (state.tasks ?? []).map(backfill),
          plans: (state.plans ?? []).map(backfill),
        };
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Selectors (scoped to the signed-in user)                                   */
/* -------------------------------------------------------------------------- */

/*
 * NOTE: these hooks select the raw (stable) arrays from the store and do the
 * per-user filtering inside useMemo. Filtering *inside* the zustand selector
 * would return a new array reference on every render, which makes
 * useSyncExternalStore believe the store changed every time -> infinite loop
 * ("Maximum update depth exceeded").
 */

/** Classes belonging to the current user. */
export function useMyClasses(): PlanClass[] {
  const uid = useAuthStore((s) => s.fbUser?.uid ?? 'anon');
  const classes = usePlannerStore((s) => s.classes);
  return useMemo(() => classes.filter((c) => c.uid === uid), [classes, uid]);
}

/** Tasks belonging to the current user. */
export function useMyTasks(): PlanTask[] {
  const uid = useAuthStore((s) => s.fbUser?.uid ?? 'anon');
  const tasks = usePlannerStore((s) => s.tasks);
  return useMemo(() => tasks.filter((t) => t.uid === uid), [tasks, uid]);
}

/** Daily-plan items belonging to the current user, optionally filtered by date. */
export function useMyPlans(date?: string): PlanItem[] {
  const uid = useAuthStore((s) => s.fbUser?.uid ?? 'anon');
  const plans = usePlannerStore((s) => s.plans);
  return useMemo(
    () => plans.filter((p) => p.uid === uid && (date ? p.date === date : true)),
    [plans, uid, date],
  );
}
