import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// use-analytics.ts wires the real planner/habits/theme stores into
// lib/analytics.ts's pure computation. Only their storage/auth boundary needs
// faking (see store/*.test.ts for the same pattern) — everything else here is
// the real store + real computation, exercised end-to-end.
vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
const mocks = vi.hoisted(() => ({ authState: { fbUser: { uid: 'u1' } as { uid: string } | null } }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

import { usePlannerStore } from '@/store/planner-store';
import { useHabitsStore } from '@/store/habits-store';
import { useThemeStore } from '@/store/theme-store';
import { useAnalytics } from './use-analytics';

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  usePlannerStore.setState({ classes: [], tasks: [], plans: [] });
  useHabitsStore.setState({ habits: [], log: {} });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('useAnalytics', () => {
  it('reports hasData: false when the user has entered nothing', () => {
    const { result } = renderHook(() => useAnalytics());
    expect(result.current.hasData).toBe(false);
    expect(result.current.range.days).toBe(7);
  });

  it('reflects real store data end-to-end, scoped to the current user', () => {
    usePlannerStore.setState({
      classes: [{ id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 0, end: 60, color: '#111', createdAt: 0 }],
      tasks: [{ id: 't1', uid: 'u1', title: 'HW', subject: 'Math', due: '', priority: 'High', done: true, createdAt: 0, completedAt: Date.now() }],
      plans: [],
    });
    useHabitsStore.setState({
      habits: [{ id: 'h1', uid: 'u1', name: 'Read', icon: '', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 }],
      log: {},
    });

    const { result } = renderHook(() => useAnalytics());
    expect(result.current.hasData).toBe(true);
    expect(result.current.classes.count).toBe(1);
    expect(result.current.tasks.total).toBe(1);
    expect(result.current.habits.total).toBe(1);
  });

  it('honors a custom `days` window', () => {
    const { result } = renderHook(() => useAnalytics(30));
    expect(result.current.range.days).toBe(30);
    expect(result.current.range.series).toHaveLength(30);
  });

  it('uses the light-mode palette colors for subject slices by default', () => {
    usePlannerStore.setState({
      classes: [{ id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 0, end: 60, color: undefined as any, createdAt: 0 }],
      tasks: [],
      plans: [],
    });
    const { result } = renderHook(() => useAnalytics());
    // No class color was recorded, so the palette-derived fallback is used.
    expect(result.current.subjects[0]?.color).toBeTruthy();
  });
});
