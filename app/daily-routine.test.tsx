import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: {
    profile: null as any,
    updateProfile: vi.fn(async () => {}),
  },
  isDark: false,
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
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
      secondary: '#8B7DFF',
      blue: '#4DA3FF',
      green: '#4CD964',
      orange: '#FFB648',
      pink: '#FF6FAE',
      bg: '#F6F5FF',
      ink: '#1B1B2F',
      muted: '#6E6B8A',
      subtle: '#9AA0B4',
      hairline: '#ECE9FB',
      card: '#FFFFFF',
    },
    Tint: { primary: '#EFEBFF', blue: '#E7F1FF', green: '#E4F9EA', orange: '#FFF3E1', pink: '#FFE9F2' },
    isDark: mocks.isDark,
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));

import DailyRoutineScreen from './daily-routine';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = null;
  mocks.isDark = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DailyRoutineScreen', () => {
  it('renders the header and defaults when no preferences are saved', () => {
    render(<DailyRoutineScreen />);
    expect(screen.getByText('Daily Routine')).toBeTruthy();
    expect(screen.getByText('Set your daily routine')).toBeTruthy();
    expect(screen.getByText('7:00 AM')).toBeTruthy(); // wake
    expect(screen.getByText('11:00 PM')).toBeTruthy(); // sleep
    expect(screen.getByText('4 h')).toBeTruthy(); // study
    expect(screen.getByText('2 h')).toBeTruthy(); // work
    expect(screen.getByText('30 min')).toBeTruthy(); // exercise
    expect(screen.getByText('3')).toBeTruthy(); // meals
    // 16h awake, 480 min committed -> 8h free
    expect(screen.getByText(/8h free out of 16h awake\./)).toBeTruthy();
  });

  it('seeds every field from the saved profile preferences', () => {
    mocks.authState.profile = {
      preferences: {
        wakeTime: 6 * 60,
        sleepTime: 22 * 60,
        studyHours: 3,
        workHours: 5,
        exerciseMinutes: 45,
        mealsPerDay: 4,
      },
    };
    render(<DailyRoutineScreen />);
    expect(screen.getByText('6:00 AM')).toBeTruthy();
    expect(screen.getByText('10:00 PM')).toBeTruthy();
    expect(screen.getByText('3 h')).toBeTruthy();
    expect(screen.getByText('5 h')).toBeTruthy();
    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('the back button calls router.back()', () => {
    render(<DailyRoutineScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(backIcon.parentElement!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('shows an over-booked warning when the routine does not fit in the day', () => {
    mocks.authState.profile = {
      preferences: {
        wakeTime: 7 * 60,
        sleepTime: 9 * 60, // only 2h awake
        studyHours: 4,
        workHours: 2,
        exerciseMinutes: 30,
        mealsPerDay: 3,
      },
    };
    render(<DailyRoutineScreen />);
    expect(screen.getByText(/Over-booked by/)).toBeTruthy();
  });

  it('handles sleep time earlier in the clock than wake time (crosses midnight)', () => {
    mocks.authState.profile = {
      preferences: {
        wakeTime: 8 * 60,
        sleepTime: 2 * 60, // sleeps at 2 AM, wakes 8 AM -> 18h awake
        studyHours: 1,
        workHours: 1,
        exerciseMinutes: 0,
        mealsPerDay: 1,
      },
    };
    render(<DailyRoutineScreen />);
    // awake = 1440 - 480 + 120 = 1080 = 18h; committed = 60+60+0+30=150=2h30m; free=15h30m
    expect(screen.getByText(/15h 30m free out of 18h awake\./)).toBeTruthy();
  });

  it('the Study Hours stepper increments and decrements within 0..12', () => {
    render(<DailyRoutineScreen />);
    const decButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'remove');
    const incButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'add');
    // Study Hours is the first stepper row (Wake/Sleep are clock pickers, not steppers).
    for (let i = 0; i < 10; i++) fireEvent.click(decButtons[0].parentElement!);
    expect(screen.getByText('0 h')).toBeTruthy();
    for (let i = 0; i < 20; i++) fireEvent.click(incButtons[0].parentElement!);
    expect(screen.getByText('12 h')).toBeTruthy();
  });

  it('the Meals stepper is clamped between 1 and 6', () => {
    render(<DailyRoutineScreen />);
    // Meals is the last stepper row.
    const decButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'remove');
    const incButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'add');
    const mealsDec = decButtons[decButtons.length - 1];
    const mealsInc = incButtons[incButtons.length - 1];
    for (let i = 0; i < 10; i++) fireEvent.click(mealsDec.parentElement!);
    expect(screen.getByText('1')).toBeTruthy();
    for (let i = 0; i < 10; i++) fireEvent.click(mealsInc.parentElement!);
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('opening the Wake Up Time picker and confirming updates the time', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 5, 6, 15));
    render(<DailyRoutineScreen />);
    fireEvent.click(screen.getByText('7:00 AM'));
    // "Wake Up Time" now appears twice: the row's own label and the modal title.
    expect(screen.getAllByText('Wake Up Time')).toHaveLength(2);
    fireEvent.click(screen.getByText('Now'));
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText('6:15 AM')).toBeTruthy();
  });

  it('the Work Hours stepper increments and decrements within 0..12', () => {
    render(<DailyRoutineScreen />);
    const decButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'remove');
    const incButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'add');
    // Work Hours is the second stepper row (after Study Hours).
    for (let i = 0; i < 10; i++) fireEvent.click(decButtons[1].parentElement!);
    expect(screen.getByText('0 h')).toBeTruthy();
    for (let i = 0; i < 20; i++) fireEvent.click(incButtons[1].parentElement!);
    expect(screen.getByText('12 h')).toBeTruthy();
  });

  it('the Exercise stepper increments and decrements by 15 within 0..180', () => {
    render(<DailyRoutineScreen />);
    const decButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'remove');
    const incButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'add');
    // Exercise is the third stepper row (after Study Hours, Work Hours).
    for (let i = 0; i < 5; i++) fireEvent.click(decButtons[2].parentElement!);
    expect(screen.getByText('0 min')).toBeTruthy();
    for (let i = 0; i < 15; i++) fireEvent.click(incButtons[2].parentElement!);
    expect(screen.getByText('180 min')).toBeTruthy();
  });

  it('renders without crashing in dark mode (isDark-dependent StatusBar branch)', () => {
    mocks.isDark = true;
    render(<DailyRoutineScreen />);
    expect(screen.getByText('Daily Routine')).toBeTruthy();
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<DailyRoutineScreen />);
    const backIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'chevron-back')!;
    const btn = backIcon.parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to a stepper decrement/increment button while held down', async () => {
    render(<DailyRoutineScreen />);
    const decIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'remove')!;
    const incIcon = screen.getAllByTestId('icon').find((el) => el.getAttribute('data-name') === 'add')!;
    const decBtn = decIcon.parentElement!;
    const incBtn = incIcon.parentElement!;
    fireEvent.mouseDown(decBtn);
    await waitFor(() => expect(getComputedStyle(decBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(decBtn);
    fireEvent.mouseDown(incBtn);
    await waitFor(() => expect(getComputedStyle(incBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(incBtn);
  });

  it('Continue saves preferences, shows "Saving…" and navigates back after resolving', async () => {
    mocks.authState.profile = { preferences: undefined };
    let resolveUpdate: () => void = () => {};
    mocks.authState.updateProfile.mockImplementation(
      () => new Promise<void>((resolve) => { resolveUpdate = resolve; }),
    );
    render(<DailyRoutineScreen />);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Saving…')).toBeTruthy();

    resolveUpdate();
    await waitFor(() => expect(mocks.router.back).toHaveBeenCalledTimes(1));
    expect(mocks.authState.updateProfile).toHaveBeenCalledWith({
      preferences: {
        wakeTime: 7 * 60,
        sleepTime: 23 * 60,
        studyHours: 4,
        workHours: 2,
        exerciseMinutes: 30,
        mealsPerDay: 3,
      },
    });
  });
});
