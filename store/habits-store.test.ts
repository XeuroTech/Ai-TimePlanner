import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// habits-store.ts persists via zustandStorage (AsyncStorage) and reads the
// current uid from auth-store — both dragged in real native/Firebase modules
// at import time, so they're mocked at the boundary (see lib/analytics.test.ts
// for the same pattern). The store's own logic is otherwise pure/local state.
vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({ authState: { fbUser: null as { uid: string } | null } }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

import {
  buildHabitProgress,
  computeBestStreak,
  computeStreak,
  habitValue,
  useHabitProgress,
  useHabitSummary,
  useHabitsStore,
  useMyHabits,
  type Habit,
  type HabitLog,
} from './habits-store';

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  useHabitsStore.setState({ habits: [], log: {} });
});

describe('habitValue', () => {
  it('returns the logged value for a habit/day', () => {
    const log: HabitLog = { h1: { '2026-01-05': 3 } };
    expect(habitValue(log, 'h1', '2026-01-05')).toBe(3);
  });

  it('returns 0 when nothing was logged for that habit or day', () => {
    const log: HabitLog = { h1: { '2026-01-05': 3 } };
    expect(habitValue(log, 'h1', '2026-01-06')).toBe(0);
    expect(habitValue(log, 'unknown', '2026-01-05')).toBe(0);
    expect(habitValue({}, 'h1', '2026-01-05')).toBe(0);
  });
});

describe('computeStreak', () => {
  it('returns 0 when there are no entries or the target is invalid', () => {
    expect(computeStreak(undefined, 2, '2026-01-05')).toBe(0);
    expect(computeStreak({ '2026-01-05': 5 }, 0, '2026-01-05')).toBe(0);
  });

  it('counts consecutive met days ending today when today already hit target', () => {
    const entries = { '2026-01-03': 2, '2026-01-04': 2, '2026-01-05': 2 };
    expect(computeStreak(entries, 2, '2026-01-05')).toBe(3);
  });

  it('does not break the streak when today is unfinished — falls back to yesterday', () => {
    const entries = { '2026-01-03': 2, '2026-01-04': 2, '2026-01-05': 0 };
    expect(computeStreak(entries, 2, '2026-01-05')).toBe(2);
  });

  it('stops at the first earlier gap', () => {
    const entries = { '2026-01-01': 2, '2026-01-04': 2, '2026-01-05': 2 };
    expect(computeStreak(entries, 2, '2026-01-05')).toBe(2);
  });

  it('treats a missing (not just zero) entry for the end day the same as unfinished', () => {
    // '2026-01-05' has no key at all, unlike the "unfinished" test above where it is 0.
    const entries = { '2026-01-04': 2 };
    expect(computeStreak(entries, 2, '2026-01-05')).toBe(1);
  });

  it('parses a malformed end-key (missing month/day) by falling back to the 1st', () => {
    // shiftKey('2026', -1) has no month/day segment to split out, so both
    // fall back to 1 (i.e. 2026-01-01), then shift back a day from there.
    expect(computeStreak({}, 1, '2026')).toBe(0);
  });
});

describe('computeBestStreak', () => {
  it('returns 0 when there are no entries or the target is invalid', () => {
    expect(computeBestStreak(undefined, 2)).toBe(0);
    expect(computeBestStreak({ '2026-01-05': 5 }, 0)).toBe(0);
  });

  it('returns 0 when nothing ever met the target', () => {
    expect(computeBestStreak({ '2026-01-05': 1 }, 2)).toBe(0);
  });

  it('treats an explicit undefined value the same as an absent entry', () => {
    const entries = { '2026-01-01': 2, '2026-01-02': undefined as unknown as number };
    expect(computeBestStreak(entries, 2)).toBe(1);
  });

  it('finds the longest run anywhere in history, not just the most recent', () => {
    const entries = {
      '2026-01-01': 2,
      '2026-01-02': 2,
      '2026-01-03': 2, // 3-day run
      '2026-01-10': 2,
      '2026-01-11': 2, // shorter, later 2-day run
    };
    expect(computeBestStreak(entries, 2)).toBe(3);
  });
});

describe('buildHabitProgress', () => {
  it('builds a progress row per habit for the requested day', () => {
    const habits: Habit[] = [
      { id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: 'pages', step: 1, target: 2, createdAt: 0 },
    ];
    const log: HabitLog = { h1: { '2026-01-05': 2, '2026-01-04': 2 } };
    const [row] = buildHabitProgress(habits, log, '2026-01-05');
    expect(row.current).toBe(2);
    expect(row.target).toBe(2);
    expect(row.done).toBe(true);
    expect(row.pct).toBe(1);
    expect(row.streak).toBe(2);
    expect(row.bestStreak).toBe(2);
  });

  it('clamps the target to at least 1 and pct to at most 1', () => {
    const habits: Habit[] = [
      { id: 'h1', uid: 'u1', name: 'Water', icon: 'water', colorKey: 'blue', unit: '', step: 1, target: 0, createdAt: 0 },
    ];
    const log: HabitLog = { h1: { '2026-01-05': 5 } };
    const [row] = buildHabitProgress(habits, log, '2026-01-05');
    expect(row.target).toBe(1);
    expect(row.pct).toBe(1);
    expect(row.done).toBe(true);
  });

  it('reports current 0 and done false for a habit with no entries yet', () => {
    const habits: Habit[] = [
      { id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 3, createdAt: 0 },
    ];
    const [row] = buildHabitProgress(habits, {}, '2026-01-05');
    expect(row.current).toBe(0);
    expect(row.done).toBe(false);
    expect(row.pct).toBe(0);
  });
});

describe('useHabitsStore', () => {
  it('addHabit appends a habit stamped with the current uid and an id, and returns that id', () => {
    const id = useHabitsStore.getState().addHabit({
      name: 'Read',
      icon: 'book',
      colorKey: 'primary',
      unit: 'pages',
      step: 1,
      target: 2,
    });
    const habits = useHabitsStore.getState().habits;
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ id, uid: 'u1', name: 'Read' });
  });

  it('updateHabit patches only the matching habit', () => {
    const id = useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 2 });
    useHabitsStore.getState().updateHabit(id, { target: 5 });
    expect(useHabitsStore.getState().habits[0].target).toBe(5);
  });

  it('updateHabit leaves every other habit untouched', () => {
    const id1 = useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 2 });
    const id2 = useHabitsStore.getState().addHabit({ name: 'Water', icon: 'water', colorKey: 'blue', unit: '', step: 1, target: 4 });
    useHabitsStore.getState().updateHabit(id2, { target: 10 });
    const habits = useHabitsStore.getState().habits;
    expect(habits.find((h) => h.id === id1)).toMatchObject({ name: 'Read', target: 2 });
    expect(habits.find((h) => h.id === id2)).toMatchObject({ name: 'Water', target: 10 });
  });

  it('addHabit stamps "anon" when no one is signed in', () => {
    mocks.authState.fbUser = null;
    const id = useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 2 });
    expect(useHabitsStore.getState().habits.find((h) => h.id === id)?.uid).toBe('anon');
  });

  it('removeHabit drops the habit and its log history', () => {
    const id = useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 2 });
    useHabitsStore.getState().setHabitValue(id, 1, '2026-01-05');
    useHabitsStore.getState().removeHabit(id);
    expect(useHabitsStore.getState().habits).toHaveLength(0);
    expect(useHabitsStore.getState().log[id]).toBeUndefined();
  });

  it('bumpHabit adds one step, and tapping a completed habit resets it to 0 (undo gesture)', () => {
    const id = useHabitsStore.getState().addHabit({ name: 'Water', icon: 'water', colorKey: 'blue', unit: '', step: 1, target: 2 });
    useHabitsStore.getState().bumpHabit(id, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(1);
    useHabitsStore.getState().bumpHabit(id, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(2); // now at target
    useHabitsStore.getState().bumpHabit(id, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(0); // undo
  });

  it('bumpHabit caps at the target even when step would overshoot it', () => {
    const id = useHabitsStore.getState().addHabit({ name: 'Water', icon: 'water', colorKey: 'blue', unit: '', step: 5, target: 2 });
    useHabitsStore.getState().bumpHabit(id, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(2);
  });

  it('bumpHabit is a no-op when the habit id does not exist', () => {
    useHabitsStore.getState().bumpHabit('missing', '2026-01-05');
    expect(useHabitsStore.getState().log).toEqual({});
  });

  it('setHabitValue writes an exact, rounded, non-negative value', () => {
    const id = useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 5 });
    useHabitsStore.getState().setHabitValue(id, 3.6, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(4);
    useHabitsStore.getState().setHabitValue(id, -2, '2026-01-05');
    expect(useHabitsStore.getState().log[id]['2026-01-05']).toBe(0);
  });

  it('clearAll wipes every habit and the whole log', () => {
    useHabitsStore.getState().addHabit({ name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 2 });
    useHabitsStore.getState().clearAll();
    expect(useHabitsStore.getState()).toMatchObject({ habits: [], log: {} });
  });
});

describe('useMyHabits', () => {
  it('returns only the current user\'s non-archived habits', () => {
    useHabitsStore.setState({
      habits: [
        { id: 'h1', uid: 'u1', name: 'Mine', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 },
        { id: 'h2', uid: 'other', name: 'Not mine', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 },
        { id: 'h3', uid: 'u1', name: 'Archived', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0, archived: true },
      ],
      log: {},
    });
    const { result } = renderHook(() => useMyHabits());
    expect(result.current.map((h) => h.name)).toEqual(['Mine']);
  });

  it('falls back to the "anon" bucket when no one is signed in', () => {
    mocks.authState.fbUser = null;
    useHabitsStore.setState({
      habits: [
        { id: 'h1', uid: 'anon', name: 'Mine', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 },
        { id: 'h2', uid: 'other', name: 'Not mine', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 },
      ],
      log: {},
    });
    const { result } = renderHook(() => useMyHabits());
    expect(result.current.map((h) => h.name)).toEqual(['Mine']);
  });
});

describe('useHabitProgress', () => {
  it('builds progress rows for the current user\'s habits on the requested day', () => {
    useHabitsStore.setState({
      habits: [{ id: 'h1', uid: 'u1', name: 'Read', icon: '', colorKey: 'primary', unit: '', step: 1, target: 2, createdAt: 0 }],
      log: { h1: { '2026-01-05': 2 } },
    });
    const { result } = renderHook(() => useHabitProgress('2026-01-05'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ current: 2, done: true });
  });
});

describe('useHabitSummary', () => {
  it('aggregates total/done/completion/bestStreak across the day\'s rows', () => {
    useHabitsStore.setState({
      habits: [
        { id: 'h1', uid: 'u1', name: 'Read', icon: '', colorKey: 'primary', unit: '', step: 1, target: 2, createdAt: 0 },
        { id: 'h2', uid: 'u1', name: 'Water', icon: '', colorKey: 'blue', unit: '', step: 1, target: 4, createdAt: 0 },
      ],
      log: { h1: { '2026-01-05': 2 }, h2: { '2026-01-05': 2 } },
    });
    const { result } = renderHook(() => useHabitSummary('2026-01-05'));
    expect(result.current.total).toBe(2);
    expect(result.current.done).toBe(1); // only h1 (2/2) met its target; h2 is 2/4
    expect(result.current.completion).toBeCloseTo((1 + 0.5) / 2);
  });

  it('returns all-zero for a user with no habits yet', () => {
    const { result } = renderHook(() => useHabitSummary('2026-01-05'));
    expect(result.current).toEqual({ total: 0, done: 0, completion: 0, bestStreak: 0 });
  });
});
