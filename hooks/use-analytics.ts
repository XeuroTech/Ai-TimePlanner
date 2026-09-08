/**
 * React binding for `lib/analytics.ts`.
 *
 * Pulls the user-scoped slices out of the planner and habit stores, hands them
 * to the pure computation and memoises the result. Screens never touch the raw
 * arrays, so Home, Analytics and Study Stats can never disagree on a number.
 */
import { useMemo } from 'react';

import { useAppTheme } from '@/hooks/use-app-theme';
import { type Analytics, computeAnalytics } from '@/lib/analytics';
import { useHabitsStore, useMyHabits } from '@/store/habits-store';
import { useMyClasses, useMyPlans, useMyTasks } from '@/store/planner-store';

/**
 * @param days How many days the trend series covers (7 for the tab, 30 for the
 *             detailed stats screen).
 */
export function useAnalytics(days = 7): Analytics {
  const { Palette } = useAppTheme();

  const classes = useMyClasses();
  const tasks = useMyTasks();
  const plans = useMyPlans();
  const habits = useMyHabits();
  const habitLog = useHabitsStore((s) => s.log);

  const colors = useMemo(
    () => [Palette.primary, Palette.blue, Palette.green, Palette.orange, Palette.pink, Palette.secondary],
    [Palette],
  );

  return useMemo(
    () => computeAnalytics({ classes, tasks, plans, habits, habitLog, days, colors }),
    [classes, tasks, plans, habits, habitLog, days, colors],
  );
}
