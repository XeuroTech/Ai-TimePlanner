import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  impl: (() => ({})) as (days?: number) => any,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

// Not used directly by this screen, but `@/lib/analytics` (imported here for
// its formatting helpers) pulls in the real `@/store/habits-store`, which in
// turn imports the real `@/store/auth-store` -> Firebase/SQLite services ->
// `expo-modules-core`, which doesn't load under jsdom. Stubbing this store
// stops that chain before it gets there.
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: { fbUser: null }) => unknown) => selector({ fbUser: null }), {
    getState: () => ({ fbUser: null }),
  }),
}));

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: (days?: number) => mocks.impl(days),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: mocks.back }),
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View> };
});

import { useThemeStore } from '@/store/theme-store';
import StudyStatsScreen from './study-stats';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

// series carries the mix breakdown: tasksDone sum=5, plansDone sum=3, habitsDone sum=2.
const series7 = [
  { key: '2026-09-01', label: 'Tue', short: 'T', isToday: false, tasksDone: 1, plansDone: 1, habitsDone: 0, total: 2 },
  { key: '2026-09-02', label: 'Wed', short: 'W', isToday: false, tasksDone: 0, plansDone: 0, habitsDone: 1, total: 1 },
  { key: '2026-09-03', label: 'Thu', short: 'T', isToday: false, tasksDone: 1, plansDone: 0, habitsDone: 0, total: 1 },
  { key: '2026-09-04', label: 'Fri', short: 'F', isToday: false, tasksDone: 0, plansDone: 1, habitsDone: 0, total: 1 },
  { key: '2026-09-05', label: 'Sat', short: 'S', isToday: false, tasksDone: 1, plansDone: 0, habitsDone: 1, total: 2 },
  { key: '2026-09-06', label: 'Sun', short: 'S', isToday: false, tasksDone: 0, plansDone: 1, habitsDone: 0, total: 1 },
  { key: '2026-09-07', label: 'Mon', short: 'M', isToday: true, tasksDone: 2, plansDone: 0, habitsDone: 0, total: 2 },
];

const fullAnalytics: any = {
  hasData: true,
  today: { key: '2026-09-07', plannedItems: 3, donePlans: 2, tasksDone: 2, habitsDone: 1, habitTotal: 1, classCount: 1, classMinutes: 60, score: 0.75 },
  range: { days: 7, series: series7, total: 10, average: 1.4, best: series7[6] },
  tasks: {
    total: 10,
    done: 6,
    pending: 4,
    completionRate: 0.6,
    byPriority: { High: { total: 4, done: 2 }, Medium: { total: 4, done: 3 }, Low: { total: 2, done: 1 } },
  },
  subjects: [
    { name: 'Math', minutes: 120, share: 0.6, color: '#123456', taskTotal: 3, taskDone: 2 },
    { name: 'Art', minutes: 0, share: 0, color: '#654321', taskTotal: 0, taskDone: 0 },
  ],
  classes: { weeklyMinutes: 200, perDay: [60, 0, 60, 0, 80, 0, 0], busiestDay: 4, count: 5 },
  habits: { rows: [], total: 0, done: 0, completion: 0, bestStreak: 0, longestEver: 10 },
  activeStreak: 5,
  // Achievement inputs: tasks.done=1 (unlocks First Step), activeStreak=5
  // (unlocks Consistent, not Committed), classes.count=5 (unlocks Organiser),
  // habits.longestEver=10 (unlocks Habitual). tasks.done above is 6 though —
  // overridden per-test below where the achievement math matters.
};

const noDataAnalytics: any = { ...fullAnalytics, hasData: false };

beforeEach(() => {
  mocks.push.mockClear();
  mocks.back.mockClear();
  mocks.impl = () => fullAnalytics;
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('StudyStatsScreen — no data', () => {
  it('shows the empty state and its CTA routes to add-class', () => {
    mocks.impl = () => noDataAnalytics;
    render(<StudyStatsScreen />);
    expect(screen.getByText('No statistics yet')).toBeTruthy();
    fireEvent.click(screen.getByText('Add to Timetable'));
    expect(mocks.push).toHaveBeenCalledWith('/add-class');
  });

  it('routes the back chevron to router.back()', () => {
    mocks.impl = () => noDataAnalytics;
    render(<StudyStatsScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon);
    expect(mocks.back).toHaveBeenCalled();
  });
});

describe('StudyStatsScreen — populated, 7-day range (default)', () => {
  it('renders the headline stat tiles', () => {
    render(<StudyStatsScreen />);
    // "5" appears twice: the streak tile and the Breakdown "Tasks" row (mix.tasks is also 5).
    expect(screen.getAllByText('5').length).toBe(2);
    expect(screen.getByText('Day streak')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy(); // range total
    expect(screen.getByText('Completed in 7d')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy(); // task completion rate
  });

  it('renders the bar chart with the trend heading and the peak callout', () => {
    render(<StudyStatsScreen />);
    expect(screen.getByText('7-day activity')).toBeTruthy();
    expect(screen.getByText('avg 1.4/day')).toBeTruthy();
    expect(screen.getByText('Peak: 2 completed on 2026-09-07')).toBeTruthy();
  });

  it('renders the breakdown derived from the trend series (tasks/plans/habits mix)', () => {
    render(<StudyStatsScreen />);
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByText('Daily plan items')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // plansDone sum
    expect(screen.getByText('Habits hit')).toBeTruthy();
    // "2" also appears as several of the trend BarChart's own per-day value labels.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('renders the weekly-load section when scheduled minutes exist', () => {
    render(<StudyStatsScreen />);
    expect(screen.getByText('Hours scheduled each weekday')).toBeTruthy();
  });

  it('renders subjects with a caption only when the subject has tasks', () => {
    render(<StudyStatsScreen />);
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('Art')).toBeTruthy();
    expect(screen.getByText('2/3 tasks done')).toBeTruthy();
  });

  it('shows achievements unlocked from real analytics inputs, with a lock icon on the rest', () => {
    render(<StudyStatsScreen />);
    // tasks.done=6 (>=1 and >=25? no) -> First Step unlocked, Finisher locked.
    // activeStreak=5 -> Consistent (>=3) unlocked, Committed (>=7) locked.
    // classes.count=5 -> Organiser unlocked. habits.longestEver=10 -> Habitual unlocked.
    expect(screen.getByText(/Achievements · 4\/6/)).toBeTruthy();
    expect(screen.getByText('First Step')).toBeTruthy();
    expect(screen.getByText('Committed')).toBeTruthy();
    const lockIcons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'lock-closed-outline');
    expect(lockIcons.length).toBe(2); // Committed + Finisher remain locked
  });
});

describe('StudyStatsScreen — 30-day range', () => {
  it('switches from the bar chart to the sparkline + axis labels', () => {
    render(<StudyStatsScreen />);
    expect(screen.getByText('7-day activity')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull(); // sparkline-only axis label

    fireEvent.click(screen.getByText('30 days'));
    expect(screen.getByText('30-day activity')).toBeTruthy();
    expect(screen.getByText('Completed in 30d')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy(); // sparkline axis label
    expect(screen.getByText('09-01')).toBeTruthy(); // series[0].key.slice(5)
  });
});

describe('StudyStatsScreen — alternate branches', () => {
  it('shows "nothing completed" fallback and hides Weekly load / Subjects when empty', () => {
    mocks.impl = () => ({
      ...fullAnalytics,
      range: { ...fullAnalytics.range, best: null },
      classes: { weeklyMinutes: 0, perDay: [0, 0, 0, 0, 0, 0, 0], busiestDay: null, count: 0 },
      subjects: [],
    });
    render(<StudyStatsScreen />);
    expect(screen.getByText('Nothing completed in this window yet.')).toBeTruthy();
    expect(screen.queryByText('Weekly load')).toBeNull();
    expect(screen.queryByText('Subjects')).toBeNull();
  });

  it('falls back to an empty axis label in the 30-day sparkline when the series is empty', () => {
    mocks.impl = () => ({ ...fullAnalytics, range: { ...fullAnalytics.range, series: [] } });
    render(<StudyStatsScreen />);
    fireEvent.click(screen.getByText('30 days'));
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('renders the dark-styled status bar when dark mode is enabled', () => {
    useThemeStore.setState({ darkMode: true });
    render(<StudyStatsScreen />);
    // StatusBar is mocked out, so this is a smoke check exercising the isDark ? 'light' : 'dark' branch.
    expect(screen.getByText('Statistics')).toBeTruthy();
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<StudyStatsScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    const backBtn = backIcon.parentElement!;
    fireEvent.mouseDown(backBtn);
    await waitFor(() => expect(getComputedStyle(backBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(backBtn);
  });
});
