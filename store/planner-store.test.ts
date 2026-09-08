import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
const mocks = vi.hoisted(() => ({ authState: { fbUser: null as { uid: string } | null } }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

import { usePlannerStore, useMyClasses, useMyTasks, useMyPlans } from './planner-store';

const baseClassInput = { subject: 'Math', day: 0, start: 540, end: 600, color: '#111' };
const baseTaskInput = { title: 'Homework', subject: 'Math', due: 'Today', priority: 'High' as const };
const basePlanInput = { date: '2026-01-05', title: 'Study', time: 600 };

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  usePlannerStore.setState({ classes: [], tasks: [], plans: [] });
});

describe('classes', () => {
  it('addClass appends a class stamped with an id, uid and createdAt', () => {
    usePlannerStore.getState().addClass(baseClassInput);
    const [cls] = usePlannerStore.getState().classes;
    expect(cls).toMatchObject({ ...baseClassInput, uid: 'u1' });
    expect(cls.id).toBeTruthy();
    expect(cls.createdAt).toBeTypeOf('number');
  });

  it('stamps "anon" when no one is signed in', () => {
    mocks.authState.fbUser = null;
    usePlannerStore.getState().addClass(baseClassInput);
    expect(usePlannerStore.getState().classes[0].uid).toBe('anon');
  });

  it('removeClass drops only the matching class', () => {
    usePlannerStore.getState().addClass(baseClassInput);
    usePlannerStore.getState().addClass({ ...baseClassInput, subject: 'Art' });
    const [first] = usePlannerStore.getState().classes;
    usePlannerStore.getState().removeClass(first.id);
    expect(usePlannerStore.getState().classes).toHaveLength(1);
    expect(usePlannerStore.getState().classes[0].subject).toBe('Art');
  });
});

describe('tasks', () => {
  it('addTask appends a not-done task', () => {
    usePlannerStore.getState().addTask(baseTaskInput);
    const [task] = usePlannerStore.getState().tasks;
    expect(task).toMatchObject({ ...baseTaskInput, uid: 'u1', done: false });
  });

  it('toggleTask marks done and stamps completedAt, then un-marks and clears it', () => {
    usePlannerStore.getState().addTask(baseTaskInput);
    const id = usePlannerStore.getState().tasks[0].id;

    usePlannerStore.getState().toggleTask(id);
    let task = usePlannerStore.getState().tasks[0];
    expect(task.done).toBe(true);
    expect(task.completedAt).toBeTypeOf('number');

    usePlannerStore.getState().toggleTask(id);
    task = usePlannerStore.getState().tasks[0];
    expect(task.done).toBe(false);
    expect(task.completedAt).toBeUndefined();
  });

  it('toggleTask leaves every other task untouched', () => {
    usePlannerStore.getState().addTask(baseTaskInput);
    usePlannerStore.getState().addTask({ ...baseTaskInput, title: 'Other' });
    const [first, second] = usePlannerStore.getState().tasks;
    usePlannerStore.getState().toggleTask(first.id);
    const tasks = usePlannerStore.getState().tasks;
    expect(tasks.find((t) => t.id === first.id)?.done).toBe(true);
    expect(tasks.find((t) => t.id === second.id)).toMatchObject({ done: false, title: 'Other' });
  });

  it('removeTask drops only the matching task', () => {
    usePlannerStore.getState().addTask(baseTaskInput);
    usePlannerStore.getState().addTask({ ...baseTaskInput, title: 'Other' });
    const id = usePlannerStore.getState().tasks[0].id;
    usePlannerStore.getState().removeTask(id);
    expect(usePlannerStore.getState().tasks).toHaveLength(1);
    expect(usePlannerStore.getState().tasks[0].title).toBe('Other');
  });
});

describe('plans', () => {
  it('addPlan appends a not-done plan', () => {
    usePlannerStore.getState().addPlan(basePlanInput);
    const [plan] = usePlannerStore.getState().plans;
    expect(plan).toMatchObject({ ...basePlanInput, uid: 'u1', done: false });
  });

  it('togglePlan marks done and stamps completedAt, then un-marks and clears it', () => {
    usePlannerStore.getState().addPlan(basePlanInput);
    const id = usePlannerStore.getState().plans[0].id;

    usePlannerStore.getState().togglePlan(id);
    expect(usePlannerStore.getState().plans[0].done).toBe(true);
    expect(usePlannerStore.getState().plans[0].completedAt).toBeTypeOf('number');

    usePlannerStore.getState().togglePlan(id);
    expect(usePlannerStore.getState().plans[0].done).toBe(false);
    expect(usePlannerStore.getState().plans[0].completedAt).toBeUndefined();
  });

  it('togglePlan leaves every other plan untouched', () => {
    usePlannerStore.getState().addPlan(basePlanInput);
    usePlannerStore.getState().addPlan({ ...basePlanInput, title: 'Other' });
    const [first, second] = usePlannerStore.getState().plans;
    usePlannerStore.getState().togglePlan(first.id);
    const plans = usePlannerStore.getState().plans;
    expect(plans.find((p) => p.id === first.id)?.done).toBe(true);
    expect(plans.find((p) => p.id === second.id)).toMatchObject({ done: false, title: 'Other' });
  });

  it('removePlan drops only the matching plan', () => {
    usePlannerStore.getState().addPlan(basePlanInput);
    usePlannerStore.getState().addPlan({ ...basePlanInput, title: 'Other' });
    const id = usePlannerStore.getState().plans[0].id;
    usePlannerStore.getState().removePlan(id);
    expect(usePlannerStore.getState().plans).toHaveLength(1);
    expect(usePlannerStore.getState().plans[0].title).toBe('Other');
  });
});

describe('selectors', () => {
  it('useMyClasses/useMyTasks return only the current user\'s rows', () => {
    usePlannerStore.setState({
      classes: [
        { id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 0, end: 1, color: '', createdAt: 0 },
        { id: 'c2', uid: 'other', subject: 'Art', day: 0, start: 0, end: 1, color: '', createdAt: 0 },
      ],
      tasks: [
        { id: 't1', uid: 'u1', title: 'Mine', subject: '', due: '', priority: 'High', done: false, createdAt: 0 },
        { id: 't2', uid: 'other', title: 'Not mine', subject: '', due: '', priority: 'High', done: false, createdAt: 0 },
      ],
      plans: [],
    });

    const classes = renderHook(() => useMyClasses());
    expect(classes.result.current).toHaveLength(1);
    expect(classes.result.current[0].subject).toBe('Math');

    const tasks = renderHook(() => useMyTasks());
    expect(tasks.result.current).toHaveLength(1);
    expect(tasks.result.current[0].title).toBe('Mine');
  });

  it('useMyPlans returns every plan for the user when no date is given, and only that date\'s when one is', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [],
      plans: [
        { id: 'p1', uid: 'u1', date: '2026-01-05', title: 'A', time: 0, done: false, createdAt: 0 },
        { id: 'p2', uid: 'u1', date: '2026-01-06', title: 'B', time: 0, done: false, createdAt: 0 },
        { id: 'p3', uid: 'other', date: '2026-01-05', title: 'C', time: 0, done: false, createdAt: 0 },
      ],
    });

    const all = renderHook(() => useMyPlans());
    expect(all.result.current.map((p) => p.title)).toEqual(['A', 'B']);

    const onDate = renderHook(() => useMyPlans('2026-01-05'));
    expect(onDate.result.current.map((p) => p.title)).toEqual(['A']);
  });

  it('every selector falls back to the "anon" bucket when no one is signed in', () => {
    mocks.authState.fbUser = null;
    usePlannerStore.setState({
      classes: [{ id: 'c1', uid: 'anon', subject: 'Math', day: 0, start: 0, end: 1, color: '', createdAt: 0 }],
      tasks: [{ id: 't1', uid: 'anon', title: 'T', subject: '', due: '', priority: 'High', done: false, createdAt: 0 }],
      plans: [{ id: 'p1', uid: 'anon', date: '2026-01-05', title: 'P', time: 0, done: false, createdAt: 0 }],
    });
    expect(renderHook(() => useMyClasses()).result.current).toHaveLength(1);
    expect(renderHook(() => useMyTasks()).result.current).toHaveLength(1);
    expect(renderHook(() => useMyPlans()).result.current).toHaveLength(1);
  });
});

describe('persist migration (v1 -> v2)', () => {
  it('backfills completedAt for already-done rows that predate the field', () => {
    const persisted = {
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Old', subject: '', due: '', priority: 'High', done: true, createdAt: 1000 }],
      plans: [{ id: 'p1', uid: 'u1', date: '2026-01-01', title: 'Old plan', time: 0, done: true, createdAt: 2000 }],
    };
    const migrate = (usePlannerStore.persist.getOptions() as any).migrate;
    const migrated = migrate(persisted, 1);
    expect(migrated.tasks[0].completedAt).toBe(1000);
    expect(migrated.plans[0].completedAt).toBe(2000);
  });

  it('does not overwrite an existing completedAt', () => {
    const persisted = {
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Old', subject: '', due: '', priority: 'High', done: true, createdAt: 1000, completedAt: 5000 }],
      plans: [],
    };
    const migrate = (usePlannerStore.persist.getOptions() as any).migrate;
    const migrated = migrate(persisted, 1);
    expect(migrated.tasks[0].completedAt).toBe(5000);
  });

  it('leaves not-done rows without a completedAt', () => {
    const persisted = {
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Old', subject: '', due: '', priority: 'High', done: false, createdAt: 1000 }],
      plans: [],
    };
    const migrate = (usePlannerStore.persist.getOptions() as any).migrate;
    const migrated = migrate(persisted, 1);
    expect(migrated.tasks[0].completedAt).toBeUndefined();
  });

  it('backfills against empty arrays when the persisted state has no tasks/plans at all', () => {
    const persisted = { classes: [] };
    const migrate = (usePlannerStore.persist.getOptions() as any).migrate;
    const migrated = migrate(persisted, 1);
    expect(migrated.tasks).toEqual([]);
    expect(migrated.plans).toEqual([]);
  });

  it('is a no-op once already at the current version', () => {
    const persisted = { classes: [], tasks: [], plans: [] };
    const migrate = (usePlannerStore.persist.getOptions() as any).migrate;
    expect(migrate(persisted, 2)).toBe(persisted);
  });
});
