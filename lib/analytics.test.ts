import { describe, it, expect, vi } from 'vitest';

// analytics.ts pulls in store/habits-store.ts for `buildHabitProgress`, which in
// turn imports the zustand-persisted storage adapter and the auth store. Both
// of those drag in AsyncStorage/Firebase (and, transitively, react-native's
// Flow-syntax entry point) purely as a side effect of module evaluation — none
// of it is exercised by the pure functions under test here, so it's mocked out
// at the module boundary instead of loaded for real.
vi.mock('@/lib/storage', () => ({
  zustandStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(() => null, { getState: () => ({ fbUser: null }) }),
}));

import { appWeekday, computeAnalytics, formatMinutesTotal, formatPercent, lastNDays } from './analytics';
import type { Habit, HabitLog } from '@/store/habits-store';
import type { PlanClass, PlanItem, PlanTask } from '@/store/planner-store';

describe('appWeekday', () => {
  it('maps Monday to 0', () => {
    expect(appWeekday(new Date(2026, 0, 5))).toBe(0); // 2026-01-05 is a Monday
  });

  it('maps Sunday to 6', () => {
    expect(appWeekday(new Date(2026, 0, 4))).toBe(6); // 2026-01-04 is a Sunday
  });
});

describe('lastNDays', () => {
  it('returns n days ending on `from`, oldest first, truncated to midnight', () => {
    const from = new Date(2026, 0, 5, 15, 30);
    const days = lastNDays(3, from);
    expect(days).toHaveLength(3);
    expect(days.map((d) => d.getDate())).toEqual([3, 4, 5]);
    expect(days.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true);
  });
});

describe('formatMinutesTotal', () => {
  it('formats minutes only when under an hour', () => {
    expect(formatMinutesTotal(45)).toBe('45m');
  });

  it('formats hours only on an exact hour boundary', () => {
    expect(formatMinutesTotal(120)).toBe('2h');
  });

  it('formats hours and minutes together', () => {
    expect(formatMinutesTotal(150)).toBe('2h 30m');
  });

  it('never returns a negative total', () => {
    expect(formatMinutesTotal(-30)).toBe('0m');
  });
});

describe('formatPercent', () => {
  it('rounds a mid-range ratio to a whole percent', () => {
    expect(formatPercent(0.724)).toBe('72%');
  });

  it('clamps ratios below 0 and above 1', () => {
    expect(formatPercent(-0.5)).toBe('0%');
    expect(formatPercent(1.5)).toBe('100%');
  });
});

describe('computeAnalytics', () => {
  it('returns an all-empty, hasData:false result for a user with nothing entered', () => {
    const result = computeAnalytics({
      classes: [],
      tasks: [],
      plans: [],
      habits: [],
      habitLog: {},
      days: 3,
      now: new Date(2026, 0, 5),
    });

    expect(result.hasData).toBe(false);
    expect(result.range.best).toBeNull();
    expect(result.range.average).toBe(0);
    expect(result.tasks).toEqual({
      total: 0,
      done: 0,
      pending: 0,
      completionRate: 0,
      byPriority: {
        High: { total: 0, done: 0 },
        Medium: { total: 0, done: 0 },
        Low: { total: 0, done: 0 },
      },
    });
    expect(result.subjects).toEqual([]);
    expect(result.classes).toEqual({ weeklyMinutes: 0, perDay: [0, 0, 0, 0, 0, 0, 0], busiestDay: null, count: 0 });
    expect(result.activeStreak).toBe(0);
    expect(result.today.score).toBe(0);
  });

  it('falls back to a 0 average and 0 tasksDone when the range covers 0 days', () => {
    const result = computeAnalytics({
      classes: [],
      tasks: [],
      plans: [],
      habits: [],
      habitLog: {},
      days: 0,
      now: new Date(2026, 0, 5),
    });

    expect(result.range.series).toEqual([]);
    expect(result.range.average).toBe(0);
    expect(result.today.tasksDone).toBe(0);
  });

  it('breaks a subject minutes tie by task count', () => {
    const classes: PlanClass[] = [
      { id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 0, end: 30, color: '#111', createdAt: 0 },
      { id: 'c2', uid: 'u1', subject: 'Art', day: 0, start: 30, end: 60, color: '#222', createdAt: 0 },
    ];
    const tasks: PlanTask[] = [
      { id: 't1', uid: 'u1', title: 'a', subject: 'Art', due: '', priority: 'Low', done: false, createdAt: 0 },
      { id: 't2', uid: 'u1', title: 'b', subject: 'Art', due: '', priority: 'Low', done: false, createdAt: 0 },
    ];

    const result = computeAnalytics({
      classes,
      tasks,
      plans: [],
      habits: [],
      habitLog: {},
      days: 1,
      now: new Date(2026, 0, 5),
    });

    // Math and Art both schedule 30 minutes; Art has more attached tasks and sorts first.
    expect(result.subjects.map((s) => s.name)).toEqual(['Art', 'Math']);
  });

  it('counts a completed plan (with no task activity) toward the active streak', () => {
    const plans: PlanItem[] = [
      {
        id: 'p1',
        uid: 'u1',
        date: '2026-01-05',
        title: 'Study session',
        time: 600,
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 5, 9).getTime(),
      },
    ];

    const result = computeAnalytics({
      classes: [],
      tasks: [],
      plans,
      habits: [],
      habitLog: {},
      days: 1,
      now: new Date(2026, 0, 5),
    });

    expect(result.activeStreak).toBe(1);
  });

  it('aggregates classes, tasks, plans and habits into the full analytics shape', () => {
    const now = new Date(2026, 0, 5); // Monday
    const today = '2026-01-05';
    const yesterday = '2026-01-04';

    const classes: PlanClass[] = [
      {
        id: 'c1',
        uid: 'u1',
        subject: 'Math',
        day: 0, // Monday, i.e. today
        start: 540,
        end: 600, // 60 minutes
        color: '#111111',
        createdAt: 0,
      },
      {
        id: 'c2',
        uid: 'u1',
        subject: 'Art',
        day: 6, // Sunday
        start: 0,
        end: 30, // 30 minutes
        color: '#222222',
        createdAt: 0,
      },
    ];

    const tasks: PlanTask[] = [
      {
        id: 't1',
        uid: 'u1',
        title: 'Algebra homework',
        subject: 'Math',
        due: 'Today',
        priority: 'High',
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 5, 9).getTime(),
      },
      {
        id: 't2',
        uid: 'u1',
        title: 'Read chapter 4',
        subject: 'Science',
        due: 'Tomorrow',
        priority: 'Medium',
        done: false,
        createdAt: 0,
      },
      {
        id: 't3',
        uid: 'u1',
        title: 'Essay draft',
        subject: 'Math',
        due: 'Yesterday',
        priority: 'Low',
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 4, 9).getTime(),
      },
    ];

    const plans: PlanItem[] = [
      {
        id: 'p1',
        uid: 'u1',
        date: today,
        title: 'Study session',
        time: 600,
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 5, 10).getTime(),
      },
      {
        id: 'p2',
        uid: 'u1',
        date: today,
        title: 'Revise notes',
        time: 800,
        done: false,
        createdAt: 0,
      },
      {
        id: 'p3',
        uid: 'u1',
        date: yesterday,
        title: 'Group project',
        time: 700,
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 4, 10).getTime(),
      },
    ];

    const habits: Habit[] = [
      { id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: 'pages', step: 1, target: 2, createdAt: 0 },
      { id: 'h2', uid: 'u1', name: 'Water', icon: 'water', colorKey: 'blue', unit: 'glasses', step: 1, target: 1, createdAt: 0 },
    ];

    const habitLog: HabitLog = {
      h1: { [today]: 2, [yesterday]: 1 },
    };

    const result = computeAnalytics({ classes, tasks, plans, habits, habitLog, days: 3, now });

    expect(result.hasData).toBe(true);

    // Daily series: oldest (Jan 3, empty) -> Jan 4 -> Jan 5 (today)
    expect(result.range.series.map((d) => d.total)).toEqual([0, 2, 3]);
    expect(result.range.total).toBe(5);
    expect(result.range.average).toBeCloseTo(5 / 3);
    expect(result.range.best?.key).toBe(today);

    // Tasks
    expect(result.tasks.total).toBe(3);
    expect(result.tasks.done).toBe(2);
    expect(result.tasks.pending).toBe(1);
    expect(result.tasks.completionRate).toBeCloseTo(2 / 3);
    expect(result.tasks.byPriority.High).toEqual({ total: 1, done: 1 });
    expect(result.tasks.byPriority.Medium).toEqual({ total: 1, done: 0 });
    expect(result.tasks.byPriority.Low).toEqual({ total: 1, done: 1 });

    // Classes
    expect(result.classes.weeklyMinutes).toBe(90);
    expect(result.classes.perDay[0]).toBe(60);
    expect(result.classes.perDay[6]).toBe(30);
    expect(result.classes.busiestDay).toBe(0);
    expect(result.classes.count).toBe(2);

    // Subjects: sorted by minutes desc; Science has a task but no scheduled time
    expect(result.subjects.map((s) => s.name)).toEqual(['Math', 'Art', 'Science']);
    const math = result.subjects.find((s) => s.name === 'Math')!;
    expect(math.minutes).toBe(60);
    expect(math.taskTotal).toBe(2);
    expect(math.taskDone).toBe(2);
    const science = result.subjects.find((s) => s.name === 'Science')!;
    expect(science.minutes).toBe(0);
    expect(science.taskTotal).toBe(1);
    expect(science.taskDone).toBe(0);

    // Habits
    expect(result.habits.total).toBe(2);
    expect(result.habits.done).toBe(1); // only h1 met its target today
    expect(result.habits.completion).toBeCloseTo(0.5);
    expect(result.habits.bestStreak).toBe(1);

    // Today snapshot
    expect(result.today.plannedItems).toBe(2);
    expect(result.today.donePlans).toBe(1);
    expect(result.today.classCount).toBe(1);
    expect(result.today.classMinutes).toBe(60);

    // Active streak: today and yesterday both had a completion, the day before did not
    expect(result.activeStreak).toBe(2);
  });

  it('buckets a task with a corrupted/unknown priority under Medium', () => {
    const tasks: PlanTask[] = [
      { id: 't1', uid: 'u1', title: 'a', subject: 'Math', due: '', priority: 'Urgent' as any, done: true, createdAt: 0 },
    ];
    const result = computeAnalytics({
      classes: [],
      tasks,
      plans: [],
      habits: [],
      habitLog: {},
      days: 1,
      now: new Date(2026, 0, 5),
    });
    expect(result.tasks.byPriority.Medium).toEqual({ total: 1, done: 1 });
  });

  it('keeps the color of the first class seen for a subject when a later class repeats it', () => {
    const classes: PlanClass[] = [
      { id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 0, end: 30, color: '#first', createdAt: 0 },
      { id: 'c2', uid: 'u1', subject: 'Math', day: 1, start: 0, end: 30, color: '#second', createdAt: 0 },
    ];
    const result = computeAnalytics({
      classes,
      tasks: [],
      plans: [],
      habits: [],
      habitLog: {},
      days: 1,
      now: new Date(2026, 0, 5),
    });
    const math = result.subjects.find((s) => s.name === 'Math')!;
    expect(math.color).toBe('#first');
  });

  it('groups a task with no subject under "General"', () => {
    const tasks: PlanTask[] = [
      { id: 't1', uid: 'u1', title: 'a', subject: '', due: '', priority: 'Low', done: false, createdAt: 0 },
    ];
    const result = computeAnalytics({
      classes: [],
      tasks,
      plans: [],
      habits: [],
      habitLog: {},
      days: 1,
      now: new Date(2026, 0, 5),
    });
    const general = result.subjects.find((s) => s.name === 'General')!;
    expect(general).toBeTruthy();
    expect(general.taskTotal).toBe(1);
  });

  it('falls back to yesterday for the active streak when today has no completions yet', () => {
    const now = new Date(2026, 0, 5, 6); // early Monday morning, nothing logged yet today

    const tasks: PlanTask[] = [
      {
        id: 't1',
        uid: 'u1',
        title: 'Done yesterday',
        subject: 'Math',
        due: 'Yesterday',
        priority: 'Medium',
        done: true,
        createdAt: 0,
        completedAt: new Date(2026, 0, 4, 9).getTime(),
      },
    ];

    const result = computeAnalytics({
      classes: [],
      tasks,
      plans: [],
      habits: [],
      habitLog: {},
      days: 3,
      now,
    });

    expect(result.activeStreak).toBe(1);
  });
});
