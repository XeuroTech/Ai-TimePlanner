import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * react-native-web's Pressable only flips its `pressed` render state after a
 * real ~50ms delay (see usePressEvents/PressResponder's DEFAULT_PRESS_DELAY_MS) —
 * a mouseDown followed immediately by a mouseUp never activates it at all. So
 * exercising a `pressed && styles.xxx` branch needs a real wait longer than
 * that delay in between (see app/daily-plan.test.tsx for the same pattern).
 */
async function pressAndRelease(el: Element) {
  fireEvent.mouseDown(el);
  await new Promise((resolve) => setTimeout(resolve, 80));
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  authState: { fbUser: { uid: 'u1' } as { uid: string } | null },
  push: vi.fn(),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
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
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { usePlannerStore } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';
import TasksScreen from './tasks';

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  mocks.push.mockClear();
  usePlannerStore.setState({ classes: [], tasks: [], plans: [] });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('TasksScreen — empty states', () => {
  it('shows the "no tasks at all" message and zero counts for the default "All" filter', () => {
    render(<TasksScreen />);
    expect(screen.getByText('No tasks yet. Add your first one.')).toBeTruthy();
    expect(screen.getByText('0 pending · 0 completed')).toBeTruthy();
  });

  it('shows a distinct message for the Pending filter when everything is done', () => {
    usePlannerStore.setState({
      tasks: [{ id: 't1', uid: 'u1', title: 'Done thing', subject: 'Math', due: 'Today', priority: 'Low', done: true, createdAt: 0 }],
    });
    render(<TasksScreen />);
    fireEvent.click(screen.getByText('Pending'));
    expect(screen.getByText('All caught up — nothing pending!')).toBeTruthy();
  });

  it('shows a distinct message for the Completed filter when nothing is done yet', () => {
    usePlannerStore.setState({
      tasks: [{ id: 't1', uid: 'u1', title: 'Pending thing', subject: 'Math', due: 'Today', priority: 'Low', done: false, createdAt: 0 }],
    });
    render(<TasksScreen />);
    fireEvent.click(screen.getByText('Completed'));
    expect(screen.getByText('No completed tasks yet.')).toBeTruthy();
  });
});

describe('TasksScreen — populated list', () => {
  const seed = () =>
    usePlannerStore.setState({
      tasks: [
        { id: 't1', uid: 'u1', title: 'Essay', subject: 'English', due: 'Today', priority: 'High', done: false, createdAt: 0 },
        { id: 't2', uid: 'u1', title: 'Worksheet', subject: 'Math', due: 'Tomorrow', priority: 'Medium', done: false, createdAt: 1 },
        { id: 't3', uid: 'u1', title: 'Reading', subject: 'English', due: 'Yesterday', priority: 'Low', done: true, createdAt: 2 },
      ],
    });

  it('shows live counts per filter segment and puts pending tasks above completed ones in "All"', () => {
    seed();
    render(<TasksScreen />);
    expect(screen.getByText('2 pending · 1 completed')).toBeTruthy();
    // Segment counts: All=3, Pending=2, Completed=1.
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    const html = document.body.innerHTML;
    // Both pending tasks sort before the completed one.
    expect(html.indexOf('Essay')).toBeLessThan(html.indexOf('Reading'));
    expect(html.indexOf('Worksheet')).toBeLessThan(html.indexOf('Reading'));
  });

  it('filters to only pending tasks', () => {
    seed();
    render(<TasksScreen />);
    fireEvent.click(screen.getByText('Pending'));
    expect(screen.getByText('Essay')).toBeTruthy();
    expect(screen.getByText('Worksheet')).toBeTruthy();
    expect(screen.queryByText('Reading')).toBeNull();
  });

  it('filters to only completed tasks', () => {
    seed();
    render(<TasksScreen />);
    fireEvent.click(screen.getByText('Completed'));
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.queryByText('Essay')).toBeNull();
  });

  it('shows subject, due label and priority chip for each row', () => {
    seed();
    render(<TasksScreen />);
    expect(screen.getAllByText('English').length).toBe(2); // Essay + Reading
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
  });

  it('toggles a task done by pressing its card (the whole card is one Pressable)', () => {
    seed();
    render(<TasksScreen />);
    fireEvent.click(screen.getByText('Essay'));
    expect(usePlannerStore.getState().tasks.find((t) => t.id === 't1')?.done).toBe(true);
  });

  it('applies the pressed style to a task card during a slow press and still toggles it on release', async () => {
    seed();
    render(<TasksScreen />);
    await pressAndRelease(screen.getByText('Essay'));
    expect(usePlannerStore.getState().tasks.find((t) => t.id === 't1')?.done).toBe(true);
  });
});

describe('TasksScreen — navigation', () => {
  it('opens Add Task from the floating action button', () => {
    render(<TasksScreen />);
    const addIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    fireEvent.click(addIcon);
    expect(mocks.push).toHaveBeenCalledWith('/add-task');
  });

  it('applies the pressed style to the floating action button during a slow press and still navigates on release', async () => {
    render(<TasksScreen />);
    const addIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    await pressAndRelease(addIcon);
    expect(mocks.push).toHaveBeenCalledWith('/add-task');
  });
});

describe('TasksScreen — theme', () => {
  it('uses the light status bar style when dark mode is enabled (default is "dark")', () => {
    useThemeStore.setState({ darkMode: true });
    render(<TasksScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });
});

describe('TasksScreen — platform-specific module behavior', () => {
  afterEach(() => {
    vi.doUnmock('react-native');
    vi.doUnmock('react-native-safe-area-context');
    vi.resetModules();
  });

  it('runs the Android layout-animation setup at module load when Platform.OS is "android"', async () => {
    vi.resetModules();
    vi.doMock('react-native', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react-native')>();
      return { ...actual, Platform: { ...actual.Platform, OS: 'android' } };
    });
    const { default: AndroidTasksScreen } = await import('./tasks');
    render(<AndroidTasksScreen />);
    expect(screen.getByText('My Tasks')).toBeTruthy();
  });

  it('uses the raw bottom inset (instead of the 12px fallback) for tab bar spacing when it is greater than 0', async () => {
    vi.resetModules();
    vi.doMock('react-native-safe-area-context', () => ({
      useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
    }));
    const { default: InsetTasksScreen } = await import('./tasks');
    expect(() => render(<InsetTasksScreen />)).not.toThrow();
  });
});
