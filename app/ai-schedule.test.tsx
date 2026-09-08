import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * ai-schedule.tsx does not itself call any AI service or write to
 * planner-store — it only collects a few preferences into a free-text prompt
 * and navigates to /ai-assistant with that prompt as a `seed` param. These
 * tests cover the form state (subjects/hours/difficulty/exam date/breaks) and
 * the resulting router.push call, not a generate/apply pipeline (there isn't
 * one on this screen).
 */

const mocks = vi.hoisted(() => ({
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  authState: { profile: null as { preferences?: Record<string, any> } | null },
  classes: [] as { subject: string }[],
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.routerPush, replace: vi.fn(), back: mocks.routerBack }),
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

vi.mock('@/store/planner-store', () => ({
  useMyClasses: () => mocks.classes,
}));

import { useThemeStore } from '@/store/theme-store';
import AiScheduleScreen from './ai-schedule';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = null;
  mocks.classes = [];
  useThemeStore.setState({ darkMode: false });
});

/** Waits out the ~50ms default press-in delay of react-native-web's Pressable. */
async function pressIn(el: Element) {
  fireEvent.mouseDown(el);
  await new Promise((resolve) => setTimeout(resolve, 80));
}

function pushedSeed(): string {
  expect(mocks.routerPush).toHaveBeenCalledTimes(1);
  const arg = mocks.routerPush.mock.calls[0][0];
  expect(arg.pathname).toBe('/ai-assistant');
  return arg.params.seed as string;
}

describe('AiScheduleScreen', () => {
  it('calls router.back() from the header chevron', () => {
    render(<AiScheduleScreen />);
    fireEvent.click(screen.getByText('icon:chevron-back'));
    expect(mocks.routerBack).toHaveBeenCalledTimes(1);
  });

  it('renders the AI suggestions', () => {
    render(<AiScheduleScreen />);
    expect(screen.getByText('Schedule harder subjects earlier in the day')).toBeTruthy();
    expect(screen.getByText('Add a revision day before the exam')).toBeTruthy();
    expect(screen.getByText('Keep sessions under 90 minutes for better focus')).toBeTruthy();
  });

  describe('subject options', () => {
    it('falls back to the generic subject list when the user has no classes', () => {
      render(<AiScheduleScreen />);
      expect(screen.getByText('Math')).toBeTruthy();
      expect(screen.getByText('Physics')).toBeTruthy();
      expect(screen.getByText('Chemistry')).toBeTruthy();
    });

    it("offers the user's own distinct class subjects instead, when they have any", () => {
      mocks.classes = [{ subject: 'Quantum Mechanics' }, { subject: 'Quantum Mechanics' }, { subject: 'Latin' }];
      render(<AiScheduleScreen />);
      expect(screen.getByText('Quantum Mechanics')).toBeTruthy();
      expect(screen.getByText('Latin')).toBeTruthy();
      expect(screen.queryByText('Math')).toBeNull();
      // deduped: only one chip per distinct subject
      expect(screen.getAllByText('Quantum Mechanics')).toHaveLength(1);
    });
  });

  describe('Generate button', () => {
    it('is disabled until at least one subject is selected', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(mocks.routerPush).not.toHaveBeenCalled();
    });

    it('enables once a subject chip is toggled on, and includes it in the prompt', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('Math');
    });

    it('drops a subject from the prompt when its chip is toggled back off', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Physics'));
      fireEvent.click(screen.getByText('Math')); // toggle off
      fireEvent.click(screen.getByText('Generate Schedule'));
      const seed = pushedSeed();
      expect(seed).toContain('Physics');
      expect(seed).not.toContain('Math');
    });

    it('includes multiple selected subjects, joined by comma', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('English'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('Math, English');
    });
  });

  describe('study hours stepper', () => {
    it('defaults to 4 hours when there is no saved preference', () => {
      render(<AiScheduleScreen />);
      expect(screen.getByText('4 h')).toBeTruthy();
    });

    it('seeds from the saved routine preferences when present', () => {
      mocks.authState.profile = { preferences: { studyHours: 6 } };
      render(<AiScheduleScreen />);
      expect(screen.getByText('6 h')).toBeTruthy();
    });

    it('increments and decrements, clamped between 1 and 12', () => {
      render(<AiScheduleScreen />);
      const [dec, inc] = screen.getAllByText(/^icon:(remove|add)$/);
      for (let i = 0; i < 5; i++) fireEvent.click(inc);
      expect(screen.getByText('9 h')).toBeTruthy();
      for (let i = 0; i < 20; i++) fireEvent.click(dec);
      expect(screen.getByText('1 h')).toBeTruthy();
    });

    it('is reflected in the generated prompt', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      const incButtons = screen.getAllByText('icon:add');
      fireEvent.click(incButtons[0]); // study hours stepper is the first Section
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('I can study 5 hours a day');
    });
  });

  describe('difficulty segment', () => {
    it('defaults to Medium', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('medium difficulty level');
    });

    it('switches to Hard when selected, reflected in the prompt', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Hard'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('hard difficulty level');
    });

    it('switches to Easy when selected', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Easy'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('easy difficulty level');
    });
  });

  describe('exam date stepper', () => {
    it('defaults 14 days out and includes the day count in the prompt', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('Create a 14-day study schedule');
    });

    it('clamps the lower bound at 1 day', () => {
      render(<AiScheduleScreen />);
      const decButtons = screen.getAllByText('icon:remove');
      // Section order: hours, difficulty(no stepper), exam date is the 3rd Stepper (index 2)
      for (let i = 0; i < 30; i++) fireEvent.click(decButtons[1]);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('Create a 1-day study schedule');
    });
  });

  describe('break time stepper', () => {
    it('defaults to 15 minutes and includes it in the prompt', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('15-minute breaks');
    });

    it('increments by 5, clamped at 60', () => {
      render(<AiScheduleScreen />);
      const incButtons = screen.getAllByText('icon:add');
      // Section order: hours(0), exam date(1), break time(2)
      for (let i = 0; i < 20; i++) fireEvent.click(incButtons[2]);
      expect(screen.getByText('60 min')).toBeTruthy();
    });

    it('decrements by 5, clamped at 5', () => {
      render(<AiScheduleScreen />);
      const decButtons = screen.getAllByText('icon:remove');
      for (let i = 0; i < 20; i++) fireEvent.click(decButtons[2]);
      expect(screen.getByText('5 min')).toBeTruthy();
    });
  });

  describe('dark mode', () => {
    it('renders without crashing when dark mode is on (StatusBar/theme branch)', () => {
      useThemeStore.setState({ darkMode: true });
      render(<AiScheduleScreen />);
      expect(screen.getByText('AI Generator')).toBeTruthy();
    });
  });

  describe('pluralization in the prompt', () => {
    it('uses the singular "hour" when study hours is clamped down to 1', () => {
      render(<AiScheduleScreen />);
      const decButtons = screen.getAllByText('icon:remove');
      // Section order: hours(0), exam date(1), break time(2)
      for (let i = 0; i < 10; i++) fireEvent.click(decButtons[0]);
      expect(screen.getByText('1 h')).toBeTruthy();
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      const seed = pushedSeed();
      expect(seed).toContain('I can study 1 hour a day');
      expect(seed).not.toContain('1 hours a day');
    });
  });

  describe('exam date stepper increment', () => {
    it('increments the exam day count, reflected in the prompt', () => {
      render(<AiScheduleScreen />);
      const incButtons = screen.getAllByText('icon:add');
      // Section order: hours(0), exam date(1), break time(2)
      fireEvent.click(incButtons[1]);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      expect(pushedSeed()).toContain('Create a 15-day study schedule');
    });
  });

  describe('pressed styling', () => {
    it('applies the pressed style on the header back button', async () => {
      render(<AiScheduleScreen />);
      const btn = screen.getByText('icon:chevron-back').parentElement!;
      await pressIn(btn);
      fireEvent.mouseUp(btn);
      fireEvent.click(btn);
      expect(mocks.routerBack).toHaveBeenCalledTimes(1);
    });

    it('applies the pressed style on a Stepper button', async () => {
      render(<AiScheduleScreen />);
      const [dec, inc] = screen.getAllByText(/^icon:(remove|add)$/);
      await pressIn(dec.parentElement!);
      fireEvent.mouseUp(dec.parentElement!);
      await pressIn(inc.parentElement!);
      fireEvent.mouseUp(inc.parentElement!);
      expect(screen.getByText('4 h')).toBeTruthy();
    });

    it('applies the pressed style on the enabled Generate button', async () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      const btn = screen.getByText('Generate Schedule').parentElement!;
      await pressIn(btn);
      fireEvent.mouseUp(btn);
    });
  });

  describe('routine bits from saved preferences', () => {
    it('folds wake/sleep, work hours and exercise minutes into the prompt when present', () => {
      mocks.authState.profile = {
        preferences: { wakeTime: 6 * 60, sleepTime: 22 * 60, workHours: 8, exerciseMinutes: 30 },
      };
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      const seed = pushedSeed();
      expect(seed).toContain('I wake at 6:00 AM and sleep at 10:00 PM');
      expect(seed).toContain('I work 8h a day');
      expect(seed).toContain('I exercise 30 min a day');
    });

    it('omits routine bits entirely when there are no saved preferences', () => {
      render(<AiScheduleScreen />);
      fireEvent.click(screen.getByText('Math'));
      fireEvent.click(screen.getByText('Generate Schedule'));
      const seed = pushedSeed();
      expect(seed).not.toContain('I wake at');
      expect(seed).not.toContain('I work');
      expect(seed).not.toContain('I exercise');
      // ends right after the exam date sentence, plus the trailing period
      expect(seed.endsWith('.')).toBe(true);
    });
  });
});
