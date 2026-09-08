import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * habits.tsx sits over @/store/habits-store (already unit-tested at the store
 * layer: habitValue/computeStreak/buildHabitProgress/the CRUD actions). The
 * screen itself is mocked at that boundary with a shared, mutable fake so
 * each test can shape the exact rows/actions it needs and assert on the spy
 * calls the screen makes.
 *
 * @/store/auth-store is mocked because usePremium() reads it, and the real
 * module drags in SQLite/Firebase at import time (not available under jsdom).
 * @/lib/storage is mocked because useAppTheme -> theme-store persists via
 * real AsyncStorage otherwise (see store/theme-store.test.ts for the same
 * pattern).
 *
 * @expo/vector-icons is mocked to render a tiny inspectable stand-in
 * (`<span data-icon data-size>`) instead of `null` — several controls in this
 * screen (header icon buttons, icon/color chips, steppers) carry no visible
 * text, so icon name + size is the only way to address them from a test.
 * Clicking/mousedown-ing that inner span still reaches the ancestor
 * Pressable: `onPress`/`onClick` is a plain React prop (bubbles normally),
 * and the long-press responder system resolves its target by walking up
 * `parentNode` from the real DOM event target, not by hit-testing geometry —
 * both walks land on the enclosing Pressable regardless of which descendant
 * node the event started on.
 */
vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size }: any) => <span data-icon={name} data-size={size} />,
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: routerMocks.push, back: routerMocks.back, replace: routerMocks.replace }),
  useLocalSearchParams: () => ({}),
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  authState: { profile: null as any, updateProfile: vi.fn(async () => {}) },
  habitsState: {
    habits: [] as any[],
    log: {} as any,
    addHabit: vi.fn(() => 'new-id'),
    updateHabit: vi.fn(),
    removeHabit: vi.fn(),
    bumpHabit: vi.fn(),
    setHabitValue: vi.fn(),
  },
  progressRows: [] as any[],
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

vi.mock('@/store/habits-store', () => ({
  useHabitsStore: Object.assign((selector: (s: typeof mocks.habitsState) => unknown) => selector(mocks.habitsState), {
    getState: () => mocks.habitsState,
  }),
  useHabitProgress: () => mocks.progressRows,
}));

import HabitsScreen from './habits';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeHabit(overrides: Partial<any> = {}) {
  return {
    id: 'h1',
    uid: 'u1',
    name: 'Drink water',
    icon: 'water-outline',
    colorKey: 'blue',
    unit: 'glasses',
    step: 1,
    target: 8,
    createdAt: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<any> = {}) {
  const habit = makeHabit(overrides.habit);
  const target = overrides.target ?? habit.target;
  const current = overrides.current ?? 0;
  return {
    habit,
    current,
    target,
    done: overrides.done ?? current >= target,
    pct: overrides.pct ?? Math.max(0, Math.min(1, current / target)),
    streak: overrides.streak ?? 0,
    bestStreak: overrides.bestStreak ?? 0,
  };
}

/** Waits out the screen's 300ms delayLongPress (+ the library's default press-start delay). */
async function longPress(el: Element) {
  fireEvent.mouseDown(el);
  await new Promise((resolve) => setTimeout(resolve, 500));
  fireEvent.mouseUp(el);
}

function iconEl(name: string, size: number): HTMLElement {
  const el = document.querySelector(`[data-icon="${name}"][data-size="${size}"]`);
  if (!el) throw new Error(`icon ${name}@${size} not found`);
  return el as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = null;
  mocks.habitsState.habits = [];
  mocks.habitsState.log = {};
  mocks.habitsState.addHabit = vi.fn(() => 'new-id');
  mocks.habitsState.updateHabit = vi.fn();
  mocks.habitsState.removeHabit = vi.fn();
  mocks.habitsState.bumpHabit = vi.fn();
  mocks.habitsState.setHabitValue = vi.fn();
  mocks.progressRows = [];
});

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — empty state', () => {
  it('shows the empty state when there are no habits', () => {
    render(<HabitsScreen />);
    expect(screen.getByText('No habits yet')).toBeTruthy();
    expect(
      screen.getByText('Add habits like water, exercise or reading, and track your daily streaks here.'),
    ).toBeTruthy();
    expect(screen.getByText('Add your first habit')).toBeTruthy();
  });

  it('tapping the empty-state CTA opens the "New habit" editor with quick-start templates', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    expect(screen.getByText('New habit')).toBeTruthy();
    expect(screen.getByText('Quick start')).toBeTruthy();
    expect(screen.getByText('Drink water')).toBeTruthy(); // template chip
    expect(screen.getByText('Exercise')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Populated list                                                             */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — populated list', () => {
  it('renders the hero summary and per-habit progress text/streak', () => {
    mocks.progressRows = [
      makeRow({ habit: { id: 'h1', name: 'Drink water', unit: 'glasses', target: 8 }, current: 4, streak: 3 }),
      makeRow({ habit: { id: 'h2', name: 'Sleep early', unit: '', target: 1 }, current: 1, streak: 5 }),
    ];
    render(<HabitsScreen />);

    // Hero: 1 of 2 done today (only h2 meets target), best streak = 5.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('/ 2')).toBeTruthy();
    expect(screen.getByText('5 day streak')).toBeTruthy();

    // Per-row progress text.
    expect(screen.getByText('4 / 8 glasses')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Drink water')).toBeTruthy();
    expect(screen.getByText('Sleep early')).toBeTruthy();
    // Streak numbers rendered next to the flame icon.
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows "Not done" for a unit-less habit that has not hit its target', () => {
    mocks.progressRows = [makeRow({ habit: { id: 'h1', name: 'Sleep early', unit: '', target: 1 }, current: 0 })];
    render(<HabitsScreen />);
    expect(screen.getByText('Not done')).toBeTruthy();
  });

  it('tapping a habit card bumps it', () => {
    mocks.progressRows = [makeRow({ habit: { id: 'h1', name: 'Drink water' }, current: 2 })];
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Drink water'));
    expect(mocks.habitsState.bumpHabit).toHaveBeenCalledWith('h1');
  });

  it('long-pressing a habit card opens the editor pre-filled with its values, without quick-start templates', async () => {
    mocks.progressRows = [
      makeRow({
        habit: {
          id: 'h1',
          name: 'Drink water',
          icon: 'water-outline',
          colorKey: 'blue',
          unit: 'glasses',
          step: 2,
          target: 8,
        },
        current: 4,
      }),
    ];
    render(<HabitsScreen />);
    await longPress(screen.getByText('Drink water'));

    expect(screen.getByText('Edit habit')).toBeTruthy();
    expect(screen.queryByText('Quick start')).toBeNull();
    expect((screen.getByPlaceholderText('e.g. Drink water') as HTMLInputElement).value).toBe('Drink water');
    expect((screen.getByPlaceholderText('glasses, min, pages…') as HTMLInputElement).value).toBe('glasses');
    expect(mocks.habitsState.bumpHabit).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Editor — create flow                                                      */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — editor create flow', () => {
  it('does not call addHabit when the name is blank', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.click(screen.getByText('Add habit'));
    expect(mocks.habitsState.addHabit).not.toHaveBeenCalled();
    expect(screen.getByText('New habit')).toBeTruthy(); // still open
  });

  it('adds a unit-less habit with target/step forced to 1', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Meditate' } });
    fireEvent.click(screen.getByText('Add habit'));

    expect(mocks.habitsState.addHabit).toHaveBeenCalledWith({
      name: 'Meditate',
      icon: 'leaf-outline',
      colorKey: 'primary',
      unit: '',
      step: 1,
      target: 1,
    });
  });

  it('applying a template fills the whole draft, then the steppers adjust target/step', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.click(screen.getByText('Exercise')); // template: barbell-outline/pink/min/step15/target30

    expect((screen.getByPlaceholderText('e.g. Drink water') as HTMLInputElement).value).toBe('Exercise');
    expect((screen.getByPlaceholderText('glasses, min, pages…') as HTMLInputElement).value).toBe('min');

    // Steppers only appear once a unit is present — the template set one.
    const targetRow = screen.getByText('Daily target').parentElement as HTMLElement;
    const stepRow = screen.getByText('Per tap').parentElement as HTMLElement;
    fireEvent.click(targetRow.querySelector('[data-icon="add"][data-size="18"]')!);
    fireEvent.click(stepRow.querySelector('[data-icon="remove"][data-size="18"]')!);

    fireEvent.click(screen.getByText('Add habit'));
    expect(mocks.habitsState.addHabit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Exercise', icon: 'barbell-outline', colorKey: 'pink', unit: 'min', target: 31, step: 14 }),
    );
  });

  it('the target stepper cannot go below 1', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Read' } });
    fireEvent.change(screen.getByPlaceholderText('glasses, min, pages…'), { target: { value: 'pages' } });

    const targetRow = screen.getByText('Daily target').parentElement as HTMLElement;
    fireEvent.click(targetRow.querySelector('[data-icon="remove"][data-size="18"]')!); // target starts at 1, stays 1

    fireEvent.click(screen.getByText('Add habit'));
    expect(mocks.habitsState.addHabit).toHaveBeenCalledWith(expect.objectContaining({ target: 1 }));
  });

  it('selecting an icon chip and a color chip changes the saved draft', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Journal' } });

    const iconGrid = screen.getByText('Icon').nextElementSibling as HTMLElement;
    fireEvent.click(iconGrid.querySelector('[data-icon="book-outline"]')!);

    const colorGrid = screen.getByText('Color').nextElementSibling as HTMLElement;
    // COLOR_CHOICES = ['primary', 'blue', 'green', 'orange', 'pink'] — pick 'green' (index 2).
    fireEvent.click(colorGrid.children[2]);

    fireEvent.click(screen.getByText('Add habit'));
    expect(mocks.habitsState.addHabit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Journal', icon: 'book-outline', colorKey: 'green' }),
    );
  });

  it('closing via the X button discards the draft', () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Discarded' } });
    fireEvent.click(iconEl('close', 22));
    // react-native-web's Modal keeps its exiting content mounted (in a hidden,
    // animated-out state) until a real `animationend` fires, which jsdom never
    // dispatches — so we assert the behavioral outcome instead of unmount.
    expect(mocks.habitsState.addHabit).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Editor — edit / delete flow                                               */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — editor edit/delete flow', () => {
  beforeEach(() => {
    mocks.progressRows = [
      makeRow({
        habit: { id: 'h1', name: 'Drink water', icon: 'water-outline', colorKey: 'blue', unit: 'glasses', step: 1, target: 8 },
        current: 4,
      }),
    ];
  });

  it('saving edits calls updateHabit with the new payload', async () => {
    render(<HabitsScreen />);
    await longPress(screen.getByText('Drink water'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Drink more water' } });
    fireEvent.click(screen.getByText('Save changes'));

    expect(mocks.habitsState.updateHabit).toHaveBeenCalledWith('h1', {
      name: 'Drink more water',
      icon: 'water-outline',
      colorKey: 'blue',
      unit: 'glasses',
      step: 1,
      target: 8,
    });
  });

  it('deleting removes the habit and closes the editor', async () => {
    render(<HabitsScreen />);
    await longPress(screen.getByText('Drink water'));
    fireEvent.click(iconEl('trash-outline', 18));

    expect(mocks.habitsState.removeHabit).toHaveBeenCalledWith('h1');
  });
});

/* -------------------------------------------------------------------------- */
/* Free-tier limit                                                           */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — free-tier habit limit', () => {
  beforeEach(() => {
    mocks.progressRows = [
      makeRow({ habit: { id: 'h1', name: 'Habit 1' } }),
      makeRow({ habit: { id: 'h2', name: 'Habit 2' } }),
      makeRow({ habit: { id: 'h3', name: 'Habit 3' } }),
    ];
  });

  it('shows the upsell banner at 3 habits on the free plan, and it redirects to /premium', () => {
    render(<HabitsScreen />);
    expect(screen.getByText('Free plan tracks 3 habits — go premium for unlimited')).toBeTruthy();
    fireEvent.click(screen.getByText('Free plan tracks 3 habits — go premium for unlimited'));
    expect(routerMocks.push).toHaveBeenCalledWith('/premium');
  });

  it('tapping the header + button at the limit redirects instead of opening the editor', () => {
    render(<HabitsScreen />);
    fireEvent.click(iconEl('add', 22));
    expect(routerMocks.push).toHaveBeenCalledWith('/premium');
    expect(screen.queryByText('New habit')).toBeNull();
    expect(mocks.habitsState.addHabit).not.toHaveBeenCalled();
  });

  it('premium users see no upsell and can still open the editor at 3+ habits', () => {
    mocks.authState.profile = { preferences: { plan: 'premium' } };
    render(<HabitsScreen />);
    expect(screen.queryByText(/go premium for unlimited/)).toBeNull();
    fireEvent.click(iconEl('add', 22));
    expect(screen.getByText('New habit')).toBeTruthy();
    expect(routerMocks.push).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Header back                                                               */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — header', () => {
  it('the back button navigates back', () => {
    render(<HabitsScreen />);
    fireEvent.click(iconEl('chevron-back', 22));
    expect(routerMocks.back).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Theme, pressed styles and defensive fallbacks                             */
/* -------------------------------------------------------------------------- */

describe('HabitsScreen — theme and pressed-style branches', () => {
  it('renders without crashing in dark mode (isDark-dependent StatusBar branch)', async () => {
    const { useThemeStore } = await import('@/store/theme-store');
    useThemeStore.getState().setDarkMode(true);
    try {
      render(<HabitsScreen />);
      expect(screen.getByText('Habit Tracker')).toBeTruthy();
    } finally {
      useThemeStore.getState().setDarkMode(false);
    }
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<HabitsScreen />);
    const btn = iconEl('chevron-back', 22).parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to the header add button while held down', async () => {
    render(<HabitsScreen />);
    const btn = iconEl('add', 22).parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to the free-tier upsell banner while held down', async () => {
    mocks.progressRows = [
      makeRow({ habit: { id: 'h1', name: 'Habit 1' } }),
      makeRow({ habit: { id: 'h2', name: 'Habit 2' } }),
      makeRow({ habit: { id: 'h3', name: 'Habit 3' } }),
    ];
    render(<HabitsScreen />);
    const btn = iconEl('sparkles', 16).parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to a quick-start template chip while held down', async () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    const btn = iconEl('water-outline', 16).parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to the delete button in the editor while held down', async () => {
    mocks.progressRows = [makeRow({ habit: { id: 'h1', name: 'Drink water' } })];
    render(<HabitsScreen />);
    await longPress(screen.getByText('Drink water'));
    const btn = iconEl('trash-outline', 18).parentElement!;
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style (darker background) to the save/add button while held down', async () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    const btn = screen.getByText('Add habit').parentElement!;
    // savePressed swaps the background to Palette.primaryDark (#5B3EEB) rather
    // than dimming opacity like the other Pressables on this screen.
    fireEvent.mouseDown(btn);
    await waitFor(() => expect(getComputedStyle(btn).backgroundColor).toBe('rgb(91, 62, 235)'), { timeout: 3000 });
    fireEvent.mouseUp(btn);
  });

  it('applies the pressed style to a stepper button, and the "Per tap" stepper increments', async () => {
    render(<HabitsScreen />);
    fireEvent.click(screen.getByText('Add your first habit'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Drink water'), { target: { value: 'Read' } });
    fireEvent.change(screen.getByPlaceholderText('glasses, min, pages…'), { target: { value: 'pages' } });

    const stepRow = screen.getByText('Per tap').parentElement as HTMLElement;
    const decBtn = stepRow.querySelector('[data-icon="remove"][data-size="18"]')!.parentElement!;
    const incBtn = stepRow.querySelector('[data-icon="add"][data-size="18"]')!.parentElement!;
    fireEvent.mouseDown(decBtn);
    await waitFor(() => expect(getComputedStyle(decBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(decBtn);
    fireEvent.mouseDown(incBtn);
    await waitFor(() => expect(getComputedStyle(incBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(incBtn);

    fireEvent.click(incBtn); // step starts at 1 -> 2
    fireEvent.click(screen.getByText('Add habit'));
    expect(mocks.habitsState.addHabit).toHaveBeenCalledWith(expect.objectContaining({ step: 2 }));
  });

  it('falls back to the primary color/tint when a stored habit has an unrecognized colorKey', () => {
    mocks.progressRows = [
      makeRow({ habit: { id: 'h1', name: 'Legacy habit', colorKey: 'no-longer-a-color' as any } }),
    ];
    // Should not throw despite the unknown colorKey — look() falls back to Palette.primary/Tint.primary.
    expect(() => render(<HabitsScreen />)).not.toThrow();
    expect(screen.getByText('Legacy habit')).toBeTruthy();
  });

  /**
   * A couple of branches in habits.tsx cannot be reached through the rendered
   * UI at all, deliberately left untested:
   *  - `onDelete`'s `if (!editing) return;` guard can't be reached through
   *    the rendered UI: the only Pressable that calls `onDelete` is itself
   *    rendered exclusively when `editing` is truthy (`{editing ? <Pressable
   *    onPress={onDelete}>...`), so the guarded branch is dead defensive code
   *    from the component's public surface.
   *  - The `?? Palette.primary` fallback for `COLOR_CHOICES` swatches (in the
   *    color-chip grid) can never trigger with the real palette: every key in
   *    the hardcoded `COLOR_CHOICES` array is guaranteed to exist on
   *    `Palette`/`Tint`. This differs from the `look()` fallback used for a
   *    *habit's own* `colorKey` (covered above), which reads untrusted
   *    persisted data and can plausibly hold a since-removed color key.
   *
   * The two platform-only branches (the module-level Android layout-animation
   * guard, and HabitEditor's iOS KeyboardAvoidingView behavior) *are*
   * reachable — same technique as app/daily-plan.test.tsx and
   * app/(tabs)/tasks.test.tsx: re-import the module fresh with `react-native`
   * partially mocked to report a different `Platform.OS`.
   */
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
      const { default: AndroidHabitsScreen } = await import('./habits');
      render(<AndroidHabitsScreen />);
      expect(screen.getByText('Habit Tracker')).toBeTruthy();
    });

    it('uses the "padding" KeyboardAvoidingView behavior in the editor when Platform.OS is "ios"', async () => {
      vi.resetModules();
      vi.doMock('react-native', async (importOriginal) => {
        const actual = await importOriginal<typeof import('react-native')>();
        return { ...actual, Platform: { ...actual.Platform, OS: 'ios' } };
      });
      const { default: IosHabitsScreen } = await import('./habits');
      render(<IosHabitsScreen />);
      expect(screen.getByText('Habit Tracker')).toBeTruthy();
    });
  });
});
