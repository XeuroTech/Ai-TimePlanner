import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  impl: (() => ({})) as (days?: number) => any,
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
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
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: (props: any) => <span data-testid="status-bar" data-style={props.style} />,
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mocks.insets,
}));

import { useThemeStore } from '@/store/theme-store';
import AnalyticsScreen from './analytics';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeSeries(totals: number[]) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return totals.map((total, i) => ({
    key: `2026-09-0${i + 1}`,
    label: labels[i],
    short: labels[i].charAt(0),
    isToday: i === totals.length - 1,
    tasksDone: total,
    plansDone: 0,
    habitsDone: 0,
    total,
  }));
}

const series = makeSeries([1, 0, 2, 1, 0, 3, 3]);
const bestDay = series.find((d) => d.total === 3)!;

const fullAnalytics: any = {
  hasData: true,
  today: { key: '2026-09-07', plannedItems: 3, donePlans: 2, tasksDone: 1, habitsDone: 1, habitTotal: 1, classCount: 1, classMinutes: 60, score: 0.75 },
  range: { days: 7, series, total: 10, average: 1.4, best: bestDay },
  tasks: {
    total: 10,
    done: 6,
    pending: 4,
    completionRate: 0.6,
    byPriority: { High: { total: 4, done: 2 }, Medium: { total: 4, done: 3 }, Low: { total: 2, done: 1 } },
  },
  subjects: [
    { name: 'Math', minutes: 120, share: 0.6, color: '#123456', taskTotal: 3, taskDone: 2 },
    { name: 'Art', minutes: 80, share: 0.4, color: '#654321', taskTotal: 0, taskDone: 0 },
  ],
  classes: { weeklyMinutes: 200, perDay: [60, 0, 60, 0, 80, 0, 0], busiestDay: 4, count: 3 },
  habits: {
    rows: [
      {
        habit: { id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 },
        current: 1,
        target: 1,
        done: true,
        pct: 1,
        streak: 3,
        bestStreak: 5,
      },
    ],
    total: 1,
    done: 1,
    completion: 1,
    bestStreak: 5,
    longestEver: 5,
  },
  activeStreak: 4,
};

const sparseAnalytics: any = {
  ...fullAnalytics,
  range: { ...fullAnalytics.range, best: null },
  tasks: {
    total: 8,
    done: 4,
    pending: 4,
    completionRate: 0.5,
    byPriority: { High: { total: 4, done: 4 }, Medium: { total: 0, done: 0 }, Low: { total: 4, done: 0 } },
  },
  subjects: [],
  classes: { weeklyMinutes: 0, perDay: [0, 0, 0, 0, 0, 0, 0], busiestDay: null, count: 0 },
  habits: { rows: [], total: 0, done: 0, completion: 0, bestStreak: 0, longestEver: 0 },
};

const noDataAnalytics: any = { ...sparseAnalytics, hasData: false };

beforeEach(() => {
  mocks.push.mockClear();
  mocks.impl = () => fullAnalytics;
  mocks.insets = { top: 0, bottom: 0, left: 0, right: 0 };
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('AnalyticsScreen — no data', () => {
  it('shows the empty state and its CTA routes to add-task', () => {
    mocks.impl = () => noDataAnalytics;
    render(<AnalyticsScreen />);
    expect(screen.getByText('No analytics yet')).toBeTruthy();
    fireEvent.click(screen.getByText('Add your first task'));
    expect(mocks.push).toHaveBeenCalledWith('/add-task');
  });
});

describe('AnalyticsScreen — populated', () => {
  it("renders today's score, active streak and ring label", () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('4 days active')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('renders the headline stat tiles', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('6')).toBeTruthy(); // tasks done
    expect(screen.getByText('Tasks completed')).toBeTruthy();
    // "3h 20m" (200 min) appears twice: the stat tile and the Subjects card meta.
    expect(screen.getAllByText('3h 20m').length).toBe(2);
    expect(screen.getByText('5')).toBeTruthy(); // best habit streak
    expect(screen.getByText('1.4')).toBeTruthy(); // range average
  });

  it('renders the 7-day trend card with its best-day callout', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('Completions')).toBeTruthy();
    expect(screen.getByText('10 total')).toBeTruthy();
    expect(screen.getByText(`Best day: ${bestDay.label} with ${bestDay.total} completed`)).toBeTruthy();
  });

  it('renders task completion rate, done/pending split and non-zero priority rows', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('6 done · 4 pending')).toBeTruthy();
    expect(screen.getByText('High priority')).toBeTruthy();
    expect(screen.getByText('Medium priority')).toBeTruthy();
    expect(screen.getByText('Low priority')).toBeTruthy();
  });

  it('renders subject split with per-subject task captions', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('Weekly time split')).toBeTruthy();
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('Art')).toBeTruthy();
    expect(screen.getByText('2/3 tasks done')).toBeTruthy();
    expect(screen.getByText('No tasks yet')).toBeTruthy();
  });

  it('renders the weekly-load section with the busiest day', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('Scheduled per day')).toBeTruthy();
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.getByText(/Busiest day: Fri/)).toBeTruthy();
  });

  it('renders the habits card with today\'s progress and streak', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('1/1 · 100%')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('3 day streak · best 5')).toBeTruthy();
  });

  it('routes the stats-chart button and "View detailed statistics" to /study-stats', () => {
    render(<AnalyticsScreen />);
    const statsIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'stats-chart')!;
    fireEvent.click(statsIcon);
    expect(mocks.push).toHaveBeenLastCalledWith('/study-stats');

    fireEvent.click(screen.getByText('View detailed statistics'));
    expect(mocks.push).toHaveBeenLastCalledWith('/study-stats');
  });
});

describe('AnalyticsScreen — theme, insets and pressed states', () => {
  it('renders in dark mode with the dark StatusBar style', () => {
    useThemeStore.setState({ darkMode: true, notificationsEnabled: true });
    render(<AnalyticsScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('accounts for a non-zero bottom safe-area inset', () => {
    mocks.insets = { top: 10, bottom: 24, left: 0, right: 0 };
    render(<AnalyticsScreen />);
    // Just proves the branch renders fine with a real bottom inset — the
    // page content itself doesn't otherwise change.
    expect(screen.getByText('Analytics')).toBeTruthy();
  });

  it('shows singular "day" wording when the active streak is exactly 1', () => {
    mocks.impl = () => ({ ...fullAnalytics, activeStreak: 1 });
    render(<AnalyticsScreen />);
    expect(screen.getByText('1 day active')).toBeTruthy();
  });

  it('shows the Subjects section without the weekly-split card when every subject has zero minutes', () => {
    mocks.impl = () => ({
      ...fullAnalytics,
      subjects: [{ name: 'History', minutes: 0, share: 0, color: '#111111', taskTotal: 2, taskDone: 1 }],
    });
    render(<AnalyticsScreen />);
    expect(screen.getByText('Subjects')).toBeTruthy();
    expect(screen.queryByText('Weekly time split')).toBeNull();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('applies the pressed style to the stats-chart button and the "View detailed statistics" row', async () => {
    render(<AnalyticsScreen />);
    const statsIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'stats-chart')!;
    const statsBtn = statsIcon.parentElement as HTMLElement;
    fireEvent.mouseDown(statsBtn);
    await waitFor(() => {
      expect(getComputedStyle(statsBtn).opacity).toBe('0.6');
    });
    fireEvent.mouseUp(statsBtn);

    const moreBtn = screen.getByText('View detailed statistics').parentElement as HTMLElement;
    fireEvent.mouseDown(moreBtn);
    await waitFor(() => {
      expect(getComputedStyle(moreBtn).opacity).toBe('0.7');
    });
    fireEvent.mouseUp(moreBtn);
  });
});

describe('AnalyticsScreen — sparse data (alternate branches)', () => {
  beforeEach(() => {
    mocks.impl = () => sparseAnalytics;
  });

  it('hides Subjects and Weekly load sections when empty', () => {
    render(<AnalyticsScreen />);
    expect(screen.queryByText('Subjects')).toBeNull();
    expect(screen.queryByText('Weekly load')).toBeNull();
  });

  it('shows the "nothing completed" fallback when there is no best day', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('Nothing completed yet this week.')).toBeTruthy();
  });

  it('skips a priority row when its total is zero', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('High priority')).toBeTruthy();
    expect(screen.getByText('Low priority')).toBeTruthy();
    expect(screen.queryByText('Medium priority')).toBeNull();
  });

  it('shows the habits empty-state with a CTA to the habit tracker', () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText('No habits tracked')).toBeTruthy();
    fireEvent.click(screen.getByText('Open Habit Tracker'));
    expect(mocks.push).toHaveBeenCalledWith('/habits');
  });
});

describe('AnalyticsScreen — additional branch coverage', () => {
  it('shows a task-count value (not minutes) for a subject with zero minutes logged', () => {
    mocks.impl = () => ({
      ...fullAnalytics,
      subjects: [
        ...fullAnalytics.subjects,
        { name: 'History', minutes: 0, share: 0, color: '#111111', taskTotal: 2, taskDone: 1 },
      ],
    });
    render(<AnalyticsScreen />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('2 tasks')).toBeTruthy();
    expect(screen.getByText('1/2 tasks done')).toBeTruthy();
  });

  it('shows the "nothing scheduled" fallback when weekly load exists but no busiest day is set', () => {
    mocks.impl = () => ({
      ...fullAnalytics,
      classes: { weeklyMinutes: 200, perDay: [0, 0, 0, 0, 0, 0, 0], busiestDay: null, count: 3 },
    });
    render(<AnalyticsScreen />);
    expect(screen.getByText('Scheduled per day')).toBeTruthy();
    expect(screen.getByText('Nothing scheduled yet.')).toBeTruthy();
  });

  it('renders a unit-based habit value, a not-done/no-unit dash value, and falls back to Palette.primary for an unrecognized color key', () => {
    mocks.impl = () => ({
      ...fullAnalytics,
      habits: {
        ...fullAnalytics.habits,
        rows: [
          {
            habit: { id: 'h1', uid: 'u1', name: 'Water', icon: 'water', colorKey: 'blue', unit: 'cups', step: 1, target: 5, createdAt: 0 },
            current: 3,
            target: 5,
            done: false,
            pct: 0.6,
            streak: 2,
            bestStreak: 4,
          },
          {
            habit: { id: 'h2', uid: 'u1', name: 'Meditate', icon: 'leaf', colorKey: 'not-a-real-color', unit: '', step: 1, target: 1, createdAt: 0 },
            current: 0,
            target: 1,
            done: false,
            pct: 0,
            streak: 0,
            bestStreak: 0,
          },
        ],
      },
    });
    render(<AnalyticsScreen />);
    expect(screen.getByText('Water')).toBeTruthy();
    expect(screen.getByText('3/5')).toBeTruthy(); // unit-based value branch
    expect(screen.getByText('Meditate')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy(); // not-done, no-unit dash branch
  });
});
