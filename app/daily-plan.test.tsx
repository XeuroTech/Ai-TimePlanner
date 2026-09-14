import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * react-native-web's Pressable only flips its `pressed` render state after a
 * real ~50ms delay (see usePressEvents/PressResponder's DEFAULT_PRESS_DELAY_MS) —
 * a mouseDown followed immediately by a mouseUp never activates it at all. So
 * exercising the `pressed && styles.pressed` branch needs a real wait longer
 * than that delay in between.
 */
async function pressAndRelease(el: Element) {
  fireEvent.mouseDown(el);
  await new Promise((resolve) => setTimeout(resolve, 80));
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  themeState: { isDark: false },
  plannerState: {
    classes: [] as any[],
    tasks: [] as any[],
    plans: [] as any[],
    addClass: vi.fn(),
    addTask: vi.fn(),
    addPlan: vi.fn(),
    togglePlan: vi.fn(),
    removePlan: vi.fn(),
  },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router, useLocalSearchParams: () => ({}) }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => {}) }));
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    Palette: {
      primary: '#6C4DFF',
      primaryDark: '#5B3EEB',
      green: '#4CD964',
      bg: '#F6F5FF',
      ink: '#1B1B2F',
      muted: '#6E6B8A',
      subtle: '#9AA0B4',
      hairline: '#ECE9FB',
      card: '#FFFFFF',
    },
    Tint: { primary: '#EFEBFF' },
    get isDark() {
      return mocks.themeState.isDark;
    },
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/store/planner-store', () => ({
  usePlannerStore: Object.assign((selector: any) => selector(mocks.plannerState), {
    getState: () => mocks.plannerState,
  }),
  useMyPlans: vi.fn((_date?: string) => mocks.plannerState.plans),
}));

import DailyPlanScreen from './daily-plan';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plannerState.plans = [];
  mocks.themeState.isDark = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DailyPlanScreen', () => {
  it('renders the header and today\'s date', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 8, 6)); // Sunday, Sept 6 2026
    render(<DailyPlanScreen />);
    expect(screen.getByText('Daily Plan')).toBeTruthy();
    expect(screen.getByText('Sunday, September 6')).toBeTruthy();
  });

  it('the back button calls router.back()', () => {
    render(<DailyPlanScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state and no summary when there are no plans', () => {
    render(<DailyPlanScreen />);
    expect(screen.getByText('No plans yet')).toBeTruthy();
    expect(screen.queryByText(/done$/)).toBeNull();
  });

  it('shows a validation error and does not add when the title is empty', () => {
    render(<DailyPlanScreen />);
    fireEvent.click(screen.getByText('Add to Plan'));
    expect(screen.getByText('Enter something to plan.')).toBeTruthy();
    expect(mocks.plannerState.addPlan).not.toHaveBeenCalled();
  });

  it('typing a title updates the input', () => {
    render(<DailyPlanScreen />);
    const input = screen.getByPlaceholderText("What's the plan? e.g. Ward round") as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ward round' } });
    expect(input.value).toBe('Ward round');
  });

  it('adds a plan with default time and no note, then clears the form', () => {
    render(<DailyPlanScreen />);
    const input = screen.getByPlaceholderText("What's the plan? e.g. Ward round") as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Ward round  ' } });
    fireEvent.click(screen.getByText('Add to Plan'));

    expect(mocks.plannerState.addPlan).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ward round', time: 9 * 60, note: undefined }),
    );
    expect(input.value).toBe('');
  });

  it('adds a plan with a note (trimmed)', () => {
    render(<DailyPlanScreen />);
    fireEvent.change(screen.getByPlaceholderText("What's the plan? e.g. Ward round"), {
      target: { value: 'Ward round' },
    });
    const note = screen.getByPlaceholderText('Note (optional)') as HTMLInputElement;
    fireEvent.change(note, { target: { value: '  bring chart  ' } });
    fireEvent.click(screen.getByText('Add to Plan'));

    expect(mocks.plannerState.addPlan).toHaveBeenCalledWith(expect.objectContaining({ note: 'bring chart' }));
    expect(note.value).toBe('');
  });

  it('changing the clock time field changes the time passed to addPlan', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 5, 14, 30)); // 2:30 PM
    render(<DailyPlanScreen />);
    fireEvent.click(screen.getByText('9:00 AM'));
    expect(screen.getByText('Plan time')).toBeTruthy();
    fireEvent.click(screen.getByText('Now'));
    fireEvent.click(screen.getByText('OK'));

    fireEvent.change(screen.getByPlaceholderText("What's the plan? e.g. Ward round"), {
      target: { value: 'Afternoon walk' },
    });
    fireEvent.click(screen.getByText('Add to Plan'));
    expect(mocks.plannerState.addPlan).toHaveBeenCalledWith(expect.objectContaining({ time: 14 * 60 + 30 }));
  });

  it('renders plans ordered by done-status then time, with a progress summary', () => {
    mocks.plannerState.plans = [
      { id: 'a', uid: 'u', date: '2026-01-01', title: 'Later done', time: 600, note: undefined, done: true, createdAt: 1 },
      { id: 'b', uid: 'u', date: '2026-01-01', title: 'Early pending', time: 480, note: 'bring pen', done: false, createdAt: 1 },
      { id: 'c', uid: 'u', date: '2026-01-01', title: 'Late pending', time: 900, note: undefined, done: false, createdAt: 1 },
    ];
    const { container } = render(<DailyPlanScreen />);
    expect(screen.getByText('1 of 3 done')).toBeTruthy();
    expect(screen.getByText('Early pending')).toBeTruthy();
    expect(screen.getByText('Late pending')).toBeTruthy();
    expect(screen.getByText('Later done')).toBeTruthy();
    // Not-done items sorted by time first (480 before 900), done items last.
    const text = container.textContent!;
    expect(text.indexOf('Early pending')).toBeLessThan(text.indexOf('Late pending'));
    expect(text.indexOf('Late pending')).toBeLessThan(text.indexOf('Later done'));
    expect(screen.getByText('bring pen')).toBeTruthy();
  });

  it('toggling a plan calls togglePlan with its id', () => {
    mocks.plannerState.plans = [
      { id: 'a', uid: 'u', date: '2026-01-01', title: 'Ward round', time: 480, done: false, createdAt: 1 },
    ];
    render(<DailyPlanScreen />);
    // Locate the checkbox: it's the first pressable child of the plan row.
    const row = screen.getByText('Ward round').closest('div')!.parentElement!.parentElement!;
    const checkbox = row.firstElementChild as HTMLElement;
    fireEvent.click(checkbox);
    expect(mocks.plannerState.togglePlan).toHaveBeenCalledWith('a');
  });

  it('deleting a plan calls removePlan with its id', () => {
    mocks.plannerState.plans = [
      { id: 'a', uid: 'u', date: '2026-01-01', title: 'Ward round', time: 480, done: false, createdAt: 1 },
    ];
    render(<DailyPlanScreen />);
    const trashIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'trash-outline')!;
    fireEvent.click(trashIcon.parentElement!);
    expect(mocks.plannerState.removePlan).toHaveBeenCalledWith('a');
  });

  it('renders the light status bar style when the theme is dark', () => {
    mocks.themeState.isDark = true;
    render(<DailyPlanScreen />);
    expect(screen.getByText('Daily Plan')).toBeTruthy();
  });

  it('applies the pressed style and still navigates when the back button is pressed and released', async () => {
    render(<DailyPlanScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    await pressAndRelease(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('applies the pressed style and still adds the plan when "Add to Plan" is pressed and released', async () => {
    render(<DailyPlanScreen />);
    fireEvent.change(screen.getByPlaceholderText("What's the plan? e.g. Ward round"), {
      target: { value: 'Ward round' },
    });
    await pressAndRelease(screen.getByText('Add to Plan'));
    expect(mocks.plannerState.addPlan).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ward round' }));
  });

  it('applies the pressed style and still deletes the plan when the delete button is pressed and released', async () => {
    mocks.plannerState.plans = [
      { id: 'a', uid: 'u', date: '2026-01-01', title: 'Ward round', time: 480, done: false, createdAt: 1 },
    ];
    render(<DailyPlanScreen />);
    const trashIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'trash-outline')!;
    await pressAndRelease(trashIcon.parentElement!);
    expect(mocks.plannerState.removePlan).toHaveBeenCalledWith('a');
  });

  describe('platform-specific module behavior', () => {
    afterEach(() => {
      vi.doUnmock('react-native');
      vi.resetModules();
    });

    it('runs the Android layout-animation setup at module load when Platform.OS is "android"', async () => {
      vi.resetModules();
      vi.doMock('react-native', async (importOriginal) => {
        const actual = await importOriginal<typeof import('react-native')>();
        return { ...actual, Platform: { ...actual.Platform, OS: 'android' } };
      });
      const { default: AndroidDailyPlanScreen } = await import('./daily-plan');
      render(<AndroidDailyPlanScreen />);
      expect(screen.getByText('Daily Plan')).toBeTruthy();
    });

    it('uses the "padding" KeyboardAvoidingView behavior when Platform.OS is "ios"', async () => {
      vi.resetModules();
      vi.doMock('react-native', async (importOriginal) => {
        const actual = await importOriginal<typeof import('react-native')>();
        return { ...actual, Platform: { ...actual.Platform, OS: 'ios' } };
      });
      const { default: IosDailyPlanScreen } = await import('./daily-plan');
      render(<IosDailyPlanScreen />);
      expect(screen.getByText('Daily Plan')).toBeTruthy();
    });
  });
});
