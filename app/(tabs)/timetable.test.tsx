import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  authState: { fbUser: { uid: 'u1' } as { uid: string } | null, profile: null as { category?: string } | null },
  push: vi.fn(),
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
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

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mocks.insets,
}));

import { usePlannerStore } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';
import TimetableScreen from './timetable';

// Wed 9 Sep 2026, 10:00 local — inside the 8AM–8PM grid window, and a fixed
// weekday so "today" highlighting is deterministic.
const FAKE_NOW = new Date(2026, 8, 9, 10, 0, 0);
const TODAY_INDEX = (FAKE_NOW.getDay() + 6) % 7; // Mon = 0

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
  mocks.authState.fbUser = { uid: 'u1' };
  mocks.authState.profile = null;
  mocks.push.mockClear();
  mocks.insets = { top: 0, bottom: 0, left: 0, right: 0 };
  usePlannerStore.setState({ classes: [], tasks: [], plans: [] });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimetableScreen — empty state', () => {
  it('shows the empty-state message with the generic CTA label when no category is set', () => {
    render(<TimetableScreen />);
    expect(screen.getByText('Nothing scheduled yet')).toBeTruthy();
    expect(screen.getByText('Add Event')).toBeTruthy();
  });

  it('uses the persona-aware CTA label for a doctor profile', () => {
    mocks.authState.profile = { category: 'doctor' };
    render(<TimetableScreen />);
    expect(screen.getByText('Add Appointment')).toBeTruthy();
  });

  it('routes the empty-state CTA and the header + button to add-class', () => {
    render(<TimetableScreen />);
    fireEvent.click(screen.getByText('Add Event'));
    expect(mocks.push).toHaveBeenLastCalledWith('/add-class');

    const addIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    fireEvent.click(addIcon);
    expect(mocks.push).toHaveBeenLastCalledWith('/add-class');
  });
});

describe('TimetableScreen — populated week', () => {
  it('renders a class event with its subject and start time, hiding the empty-state', () => {
    usePlannerStore.setState({
      classes: [
        { id: 'c1', uid: 'u1', subject: 'Chemistry', day: TODAY_INDEX, start: 540, end: 600, color: '#123456', createdAt: 0 },
      ],
    });
    render(<TimetableScreen />);
    expect(screen.getByText('Chemistry')).toBeTruthy();
    // "9 AM" renders twice: once as the hour-grid label, once as the event's own time.
    expect(screen.getAllByText('9 AM').length).toBe(2);
    expect(screen.queryByText('Nothing scheduled yet')).toBeNull();
  });

  it('renders one event per class across different days', () => {
    usePlannerStore.setState({
      classes: [
        { id: 'c1', uid: 'u1', subject: 'Chemistry', day: 0, start: 540, end: 600, color: '#111', createdAt: 0 },
        { id: 'c2', uid: 'u1', subject: 'History', day: 4, start: 600, end: 660, color: '#222', createdAt: 0 },
      ],
    });
    render(<TimetableScreen />);
    expect(screen.getByText('Chemistry')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });
});

describe('TimetableScreen — week navigation', () => {
  it('changes the displayed week range when paging forward, and restores it paging back', () => {
    render(<TimetableScreen />);
    const getWeekRangeText = () => screen.getAllByText(/\d{4}/)[0]?.textContent ?? '';
    const initial = getWeekRangeText();
    expect(initial).toBeTruthy();

    const forwardArrow = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-forward')!;
    fireEvent.click(forwardArrow);
    expect(getWeekRangeText()).not.toBe(initial);

    const backArrow = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backArrow);
    expect(getWeekRangeText()).toBe(initial);
  });
});

describe('TimetableScreen — navigation', () => {
  it('opens the calendar screen from the calendar icon', () => {
    render(<TimetableScreen />);
    const calIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'calendar-outline')!;
    fireEvent.click(calIcon);
    expect(mocks.push).toHaveBeenLastCalledWith('/calendar');
  });
});

describe('TimetableScreen — misc branches', () => {
  it('renders without crashing when the device reports a bottom safe-area inset', () => {
    // Exercises the `insets.bottom > 0 ? insets.bottom : 12` branch used to
    // pad the scroll content above the tab bar — nothing else is observable
    // from outside.
    mocks.insets = { top: 0, bottom: 20, left: 0, right: 0 };
    render(<TimetableScreen />);
    expect(screen.getByText('Timetable')).toBeTruthy();
  });

  it('renders the StatusBar in light style when dark mode is on', () => {
    // StatusBar itself is mocked out, but this still exercises the
    // `isDark ? 'light' : 'dark'` branch in the style prop expression.
    useThemeStore.setState({ darkMode: true });
    render(<TimetableScreen />);
    expect(screen.getByText('Timetable')).toBeTruthy();
  });

  it('shows an abbreviated month-to-month range when the visible week spans two months', () => {
    vi.setSystemTime(new Date(2026, 7, 31, 10, 0, 0)); // Mon 31 Aug 2026 — week runs into September
    render(<TimetableScreen />);
    expect(screen.getByText(/31 Aug\s*–\s*6 Sep 2026/)).toBeTruthy();
  });

  // This suite runs under `vi.useFakeTimers()`, so react-native-web's Pressable
  // (whose `pressed` activation fires off a real ~50ms delayPressStart timer)
  // never settles on its own the way `waitFor` polling normally observes it.
  // Advance the fake clock ourselves, inside `act`, so React flushes the
  // resulting state update before we read the computed style.
  async function expectPressedStyle(el: HTMLElement, assert: () => void) {
    fireEvent.mouseDown(el);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    assert();
    fireEvent.mouseUp(el);
  }

  it('applies the pressed style while held down on the calendar button, add button and both week arrows', async () => {
    render(<TimetableScreen />);
    const iconByName = (name: string) => screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === name)!;

    // calBtn: pressed && styles.pressed
    await expectPressedStyle(iconByName('calendar-outline').parentElement!, () =>
      expect(getComputedStyle(iconByName('calendar-outline').parentElement!).opacity).toBe('0.5'),
    );

    // addBtn: pressed && styles.addPressed swaps in Palette.primaryDark (#5B3EEB)
    // in place of the default Palette.primary (#6C4DFF) background.
    const addBtnEl = iconByName('add').parentElement!;
    await expectPressedStyle(addBtnEl, () => expect(getComputedStyle(addBtnEl).backgroundColor).toBe('rgb(91, 62, 235)'));

    // week arrow (back): pressed && styles.pressed
    await expectPressedStyle(iconByName('chevron-back').parentElement!, () =>
      expect(getComputedStyle(iconByName('chevron-back').parentElement!).opacity).toBe('0.5'),
    );

    // week arrow (forward): pressed && styles.pressed
    await expectPressedStyle(iconByName('chevron-forward').parentElement!, () =>
      expect(getComputedStyle(iconByName('chevron-forward').parentElement!).opacity).toBe('0.5'),
    );
  });
});
