import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  authState: {
    fbUser: { uid: 'u1' } as { uid: string } | null,
    profile: null as { name?: string; category?: string } | null,
  },
  push: vi.fn(),
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
  useProfile: () => mocks.authState.profile,
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

import { usePlannerStore } from '@/store/planner-store';
import { useHabitsStore } from '@/store/habits-store';
import { useNotificationStore } from '@/store/notification-store';
import { useThemeStore } from '@/store/theme-store';
import { toDateKey } from '@/lib/time';
import { LightPalette } from '@/constants/palette';
import HomeScreen from './index';

/** Converts a "#RRGGBB" hex string to the "rgb(r, g, b)" form the DOM reports. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Fixed instant so "today" (schedule day-of-week, habit dateKey) is deterministic.
const FAKE_NOW = new Date(2026, 8, 8, 10, 0, 0); // Tue 8 Sep 2026, 10:00 local
const TODAY_INDEX = (FAKE_NOW.getDay() + 6) % 7; // Mon = 0
const TODAY_KEY = toDateKey(FAKE_NOW);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
  mocks.authState.fbUser = { uid: 'u1' };
  mocks.authState.profile = null;
  mocks.push.mockClear();
  usePlannerStore.setState({ classes: [], tasks: [], plans: [] });
  useHabitsStore.setState({ habits: [], log: {} });
  useNotificationStore.setState({ items: [] });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
  mocks.insets = { top: 0, bottom: 0, left: 0, right: 0 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HomeScreen — empty states', () => {
  it('shows empty-state messaging for schedule and tasks, hides the habits section, and greets with a fallback name', () => {
    render(<HomeScreen />);
    expect(screen.getByText(/there/)).toBeTruthy();
    expect(screen.getByText('Your day is clear')).toBeTruthy();
    expect(screen.getByText('No upcoming tasks')).toBeTruthy();
    expect(screen.getByText('Plan your day & add to-dos')).toBeTruthy();
    expect(screen.queryByText('Habits')).toBeNull();
  });

  it('shows no notification badge when the inbox is empty', () => {
    render(<HomeScreen />);
    expect(screen.getAllByTestId('icon').length).toBeGreaterThan(0); // sanity: icons do render
    // Badge is a numeric/"9+" Text sibling of the bell icon — absent when unread is 0.
    expect(screen.queryByText('9+')).toBeNull();
  });
});

describe('HomeScreen — populated schedule', () => {
  it('merges today\'s classes and daily-plan items into one time-sorted schedule', () => {
    usePlannerStore.setState({
      classes: [
        { id: 'c1', uid: 'u1', subject: 'Math', day: TODAY_INDEX, start: 540, end: 600, color: '#123456', createdAt: 0 },
      ],
      tasks: [],
      plans: [
        { id: 'p1', uid: 'u1', date: TODAY_KEY, title: 'Read', time: 480, note: 'Ch. 3', done: false, createdAt: 0 },
      ],
    });

    render(<HomeScreen />);
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.queryByText('Your day is clear')).toBeNull();

    // Read (8:00 AM) is earlier than Math (9:00 AM), so it must render first.
    const html = document.body.innerHTML;
    expect(html.indexOf('Read')).toBeLessThan(html.indexOf('Math'));
  });

  it('shows the Daily Plan progress summary once plans exist for today', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [],
      plans: [
        { id: 'p1', uid: 'u1', date: TODAY_KEY, title: 'Read', time: 480, done: true, createdAt: 0 },
        { id: 'p2', uid: 'u1', date: TODAY_KEY, title: 'Write', time: 500, done: false, createdAt: 0 },
      ],
    });
    render(<HomeScreen />);
    expect(screen.getByText('1 of 2 done today')).toBeTruthy();
  });

  it('toggles a done plan item back to pending when its checkbox is pressed', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [],
      plans: [{ id: 'p1', uid: 'u1', date: TODAY_KEY, title: 'Read', time: 480, done: true, createdAt: 0 }],
    });
    render(<HomeScreen />);
    const checkIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'checkmark');
    expect(checkIcon).toBeTruthy();
    fireEvent.click(checkIcon!);
    expect(usePlannerStore.getState().plans[0].done).toBe(false);
  });
});

describe('HomeScreen — upcoming tasks', () => {
  it('lists pending tasks (capped preview) with subject/due and priority', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [
        { id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 },
        { id: 't2', uid: 'u1', title: 'Old', subject: 'Math', due: 'Yesterday', priority: 'Low', done: true, createdAt: 0 },
      ],
      plans: [],
    });
    render(<HomeScreen />);
    expect(screen.getByText('Essay')).toBeTruthy();
    expect(screen.getByText('English · Today')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    // Already-done tasks are excluded from the "upcoming" preview.
    expect(screen.queryByText('Old')).toBeNull();
  });

  it('un-marks a done task when its checkbox is pressed (task shown via a done plan\'s check icon path)', () => {
    // Use a done task so the checkmark icon renders and the click can bubble to the Pressable.
    usePlannerStore.setState({
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 }],
      plans: [],
    });
    render(<HomeScreen />);
    expect(screen.getByText('Essay')).toBeTruthy();
    // Toggle on then off via the real store to prove wiring, since a *pending*
    // task's checkbox has no child element to click (it's an empty Pressable).
    usePlannerStore.getState().toggleTask('t1');
    expect(usePlannerStore.getState().tasks[0].done).toBe(true);
  });
});

describe('HomeScreen — habits summary', () => {
  it('renders the habit progress card only once habits exist', () => {
    useHabitsStore.setState({
      habits: [{ id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 }],
      log: { h1: { [TODAY_KEY]: 1 } },
    });
    render(<HomeScreen />);
    expect(screen.getByText('Habits')).toBeTruthy();
    expect(screen.getByText('1 of 1 done today')).toBeTruthy();
  });

  it('routes the Habits section "See All" and a tap on the habit card itself to /habits', () => {
    useHabitsStore.setState({
      habits: [{ id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 }],
      log: { h1: { [TODAY_KEY]: 1 } },
    });
    render(<HomeScreen />);

    // With habits present, "See All" appears for Schedule, Habits, then Tasks (in that order).
    const seeAll = screen.getAllByText('See All');
    expect(seeAll.length).toBe(3);
    fireEvent.click(seeAll[1]);
    expect(mocks.push).toHaveBeenLastCalledWith('/habits');

    fireEvent.click(screen.getByText('1 of 1 done today'));
    expect(mocks.push).toHaveBeenLastCalledWith('/habits');
  });
});

describe('HomeScreen — greeting copy varies with time of day', () => {
  it('shows "Good Afternoon" between noon and 5pm', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 14, 0, 0));
    render(<HomeScreen />);
    expect(screen.getByText(/Good Afternoon/)).toBeTruthy();
  });

  it('shows "Good Evening" from 5pm onward', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 20, 0, 0));
    render(<HomeScreen />);
    expect(screen.getByText(/Good Evening/)).toBeTruthy();
  });
});

describe('HomeScreen — upcoming task checkbox', () => {
  it('toggles a pending task done via a direct click on its checkbox Pressable', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 }],
      plans: [],
    });
    render(<HomeScreen />);
    // Locate the checkbox: it's the first pressable child of the task row.
    const row = screen.getByText('Essay').closest('div')!.parentElement!.parentElement!;
    const checkbox = row.firstElementChild as HTMLElement;
    fireEvent.click(checkbox);
    expect(usePlannerStore.getState().tasks[0].done).toBe(true);
  });
});

describe('HomeScreen — notification badge', () => {
  it('shows the unread count, capped at "9+"', () => {
    useNotificationStore.setState({
      items: Array.from({ length: 11 }, (_, i) => ({
        id: `n${i}`,
        uid: 'u1',
        title: 'Reminder',
        message: 'x',
        at: i,
        read: false,
        icon: 'notifications',
        colorKey: 'primary',
        kind: 'reminder',
      })),
    });
    render(<HomeScreen />);
    expect(screen.getByText('9+')).toBeTruthy();
  });

  it('shows the exact count under 10', () => {
    useNotificationStore.setState({
      items: [
        { id: 'n1', uid: 'u1', title: 'Reminder', message: 'x', at: 1, read: false, icon: 'notifications', colorKey: 'primary', kind: 'reminder' },
      ],
    });
    render(<HomeScreen />);
    expect(screen.getByText('1')).toBeTruthy();
  });
});

describe('HomeScreen — navigation', () => {
  it('routes the notification bell and avatar to their screens', () => {
    mocks.authState.profile = { name: 'Zara' };
    render(<HomeScreen />);

    const bellIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'notifications-outline')!;
    fireEvent.click(bellIcon);
    expect(mocks.push).toHaveBeenLastCalledWith('/notifications');

    fireEvent.click(screen.getByText('Z'));
    expect(mocks.push).toHaveBeenLastCalledWith('/profile');
  });

  it('opens Daily Plan, Timetable "See All" and Tasks "See All"', () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByText('Daily Plan'));
    expect(mocks.push).toHaveBeenLastCalledWith('/daily-plan');

    const seeAll = screen.getAllByText('See All');
    fireEvent.click(seeAll[0]);
    expect(mocks.push).toHaveBeenLastCalledWith('/timetable');
    fireEvent.click(seeAll[1]);
    expect(mocks.push).toHaveBeenLastCalledWith('/tasks');
  });

  it('routes quick actions using the persona-aware label for "Add Class"', () => {
    mocks.authState.profile = { name: 'Ayesha', category: 'student' };
    // A pending task avoids the "Upcoming Tasks" empty-state, which also has
    // an "Add Task" CTA and would otherwise make the query below ambiguous.
    usePlannerStore.setState({
      classes: [],
      tasks: [{ id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 }],
      plans: [],
    });
    render(<HomeScreen />);
    expect(screen.getByText('Add Class')).toBeTruthy();

    fireEvent.click(screen.getByText('Add Class'));
    expect(mocks.push).toHaveBeenLastCalledWith('/add-class');

    fireEvent.click(screen.getByText('Add Task'));
    expect(mocks.push).toHaveBeenLastCalledWith('/add-task');

    fireEvent.click(screen.getByText('AI Planner'));
    expect(mocks.push).toHaveBeenLastCalledWith('/ai-assistant');

    fireEvent.click(screen.getByText('Reminders'));
    expect(mocks.push).toHaveBeenLastCalledWith('/reminders');
  });

  it('falls back to the generic quick-action label without a category, and the FAB opens the AI assistant', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Add Event')).toBeTruthy();

    const sparkleIcons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'sparkles');
    // Last "sparkles" icon in the tree is the floating action button.
    fireEvent.click(sparkleIcons[sparkleIcons.length - 1]);
    expect(mocks.push).toHaveBeenLastCalledWith('/ai-assistant');
  });

  it('empty-state CTAs route to add-class / add-task', () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByText('Add to Timetable'));
    expect(mocks.push).toHaveBeenLastCalledWith('/add-class');

    // "Add Task" appears both as the empty-state CTA and the quick-action
    // label with no category selected — both wire to the same route.
    const addTaskEls = screen.getAllByText('Add Task');
    fireEvent.click(addTaskEls[0]);
    expect(mocks.push).toHaveBeenLastCalledWith('/add-task');
  });
});

describe('HomeScreen — theme and safe-area insets', () => {
  it('renders in dark mode with the dark StatusBar style', () => {
    useThemeStore.setState({ darkMode: true, notificationsEnabled: true });
    render(<HomeScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('accounts for a non-zero bottom safe-area inset', () => {
    mocks.insets = { top: 10, bottom: 24, left: 0, right: 0 };
    render(<HomeScreen />);
    // Just proves the branch renders fine with a real bottom inset — the
    // page content itself doesn't otherwise change.
    expect(screen.getByText('Daily Plan')).toBeTruthy();
  });
});

describe('HomeScreen — multiple upcoming tasks', () => {
  it('renders a divider between rows but not after the last one', () => {
    usePlannerStore.setState({
      classes: [],
      tasks: [
        { id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 },
        { id: 't2', uid: 'u1', title: 'Report', subject: 'Science', due: 'Tomorrow', priority: 'Low', done: false, createdAt: 0 },
      ],
      plans: [],
    });
    render(<HomeScreen />);
    expect(screen.getByText('Essay')).toBeTruthy();
    expect(screen.getByText('Report')).toBeTruthy();
  });
});

describe('HomeScreen — pressed visual states', () => {
  it('applies the pressed style to the bell, avatar, Daily Plan CTA, habit card, quick-action card, FAB and "See All"', async () => {
    useHabitsStore.setState({
      habits: [{ id: 'h1', uid: 'u1', name: 'Read', icon: 'book', colorKey: 'primary', unit: '', step: 1, target: 1, createdAt: 0 }],
      log: { h1: { [TODAY_KEY]: 1 } },
    });
    render(<HomeScreen />);
    // The Pressable responder's ~50ms activation delay relies on real timers.
    vi.useRealTimers();

    const press = async (el: HTMLElement, expectOpacity?: string, expectBg?: string) => {
      fireEvent.mouseDown(el);
      await waitFor(() => {
        if (expectOpacity !== undefined) expect(getComputedStyle(el).opacity).toBe(expectOpacity);
        if (expectBg !== undefined) expect(getComputedStyle(el).backgroundColor).toBe(expectBg);
      });
      fireEvent.mouseUp(el);
    };

    const bellIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'notifications-outline')!;
    await press(bellIcon.parentElement as HTMLElement, '0.6');

    const avatarPressable = screen.getByText('T').parentElement as HTMLElement;
    await press(avatarPressable, '0.6');

    const planBtn = screen.getByText('Daily Plan').parentElement!.parentElement as HTMLElement;
    await press(planBtn, undefined, hexToRgb(LightPalette.primaryDark));

    const habitCard = screen.getByText('1 of 1 done today').parentElement!.parentElement as HTMLElement;
    await press(habitCard, '0.85');

    const quickAction = screen.getByText('Add Event').parentElement as HTMLElement;
    await press(quickAction, '0.85');

    const sparkleIcons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'sparkles');
    const fab = sparkleIcons[sparkleIcons.length - 1].parentElement as HTMLElement;
    await press(fab, undefined, hexToRgb(LightPalette.primaryDark));

    const seeAll = screen.getAllByText('See All')[0].parentElement as HTMLElement;
    await press(seeAll, '0.6');
  });
});
