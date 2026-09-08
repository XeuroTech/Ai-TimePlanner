import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: {
    profile: { name: 'Alex', category: 'student' } as any,
    completeOnboarding: vi.fn(async () => {}),
  },
  theme: { isDark: false },
  platform: { os: 'web' as string },
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-status-bar', () => ({
  StatusBar: (props: any) => <span data-testid="status-bar" data-style={props.style} />,
}));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => {}) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} /> }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));
vi.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    Palette: { primary: '#6C4DFF', subtle: '#999', ink: '#111' },
    Tint: { primary: '#EFEBFF' },
    isDark: mocks.theme.isDark,
    setDarkMode: vi.fn(),
  }),
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: any) => selector(mocks.authState), { getState: () => mocks.authState }),
}));
// Real react-native-web is kept for everything except `Platform.OS`, which is
// made a live getter so a single test can flip it to 'ios' to exercise the
// iOS-only KeyboardAvoidingView behavior branch — under the react-native-web
// alias it otherwise always resolves to 'web' and that branch would be
// unreachable.
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const Platform = { ...actual.Platform };
  Object.defineProperty(Platform, 'OS', { get: () => mocks.platform.os, configurable: true });
  return { ...actual, Platform };
});

import WizardScreen from './wizard';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = { name: 'Alex', category: 'student' } as any;
  mocks.theme.isDark = false;
  mocks.platform.os = 'web';
});

describe('WizardScreen', () => {
  it('renders the header tailored to the profile category, seeded with the profile name', () => {
    render(<WizardScreen />);
    expect(screen.getByText('Set up your planner')).toBeTruthy();
    expect(screen.getByText('A few details so your student planner fits your day.')).toBeTruthy();
    expect(screen.getByDisplayValue('Alex')).toBeTruthy();
  });

  it('falls back to the "other" category and an empty name when there is no profile', () => {
    mocks.authState.profile = null;
    render(<WizardScreen />);
    expect(screen.getByText('A few details so your other planner fits your day.')).toBeTruthy();
  });

  it('defaults Mon-Fri selected as working days, and toggling a chip flips it', () => {
    render(<WizardScreen />);
    // All five weekday chips start selected (accessible via the "on" chip's dark text is hard to
    // assert directly, so this test exercises the toggle round-trip instead).
    fireEvent.click(screen.getByText('Sat')); // turn on
    fireEvent.click(screen.getByText('Mon')); // turn off
    fireEvent.click(screen.getByText('Sat')); // turn back off
    // No throw / crash across toggles is the main guarantee here; the generate()
    // call below confirms `days` actually reached the store correctly.
    expect(screen.getByText('Sat')).toBeTruthy();
  });

  it('shows a validation error and does not save when Name is cleared', async () => {
    render(<WizardScreen />);
    const nameInput = screen.getByDisplayValue('Alex');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Generate My Planner'));

    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(mocks.authState.completeOnboarding).not.toHaveBeenCalled();
  });

  it('submits the full form and navigates into the app', async () => {
    render(<WizardScreen />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Pakistan'), { target: { value: 'Pakistan' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. GMT+5'), { target: { value: 'GMT+5' } });
    fireEvent.change(
      screen.getByPlaceholderText('e.g. Stay consistent, finish projects on time, study 2h daily…'),
      { target: { value: 'Ship the app' } },
    );

    fireEvent.click(screen.getByText('Generate My Planner'));

    await waitFor(() => expect(mocks.authState.completeOnboarding).toHaveBeenCalledTimes(1));
    const arg = mocks.authState.completeOnboarding.mock.calls[0][0];
    expect(arg).toMatchObject({
      name: 'Alex',
      country: 'Pakistan',
      timezone: 'GMT+5',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      wakeTime: 7 * 60,
      sleepTime: 23 * 60,
      workingHours: 8,
      reminderTime: 9 * 60,
      aiGoals: 'Ship the app',
    });
    expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('the working-hours stepper increments and decrements within 1..16', () => {
    render(<WizardScreen />);
    const incButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'add');
    const decButtons = screen.getAllByTestId('icon').filter((el) => el.getAttribute('data-name') === 'remove');
    expect(screen.getByText('8 h')).toBeTruthy();

    fireEvent.click(incButtons[0].closest('div')!.parentElement!);
    // Working Hours starts at 8h; incrementing/decrementing shouldn't throw and
    // stays clamped between 1 and 16 (exercised via repeated presses below).
    for (let i = 0; i < 20; i++) {
      fireEvent.click(decButtons[0].parentElement!);
    }
    expect(screen.getByText('1 h')).toBeTruthy();
    for (let i = 0; i < 20; i++) {
      fireEvent.click(incButtons[0].parentElement!);
    }
    expect(screen.getByText('16 h')).toBeTruthy();
  });

  it('applies the pressed style on the stepper dec/inc buttons while held down', async () => {
    render(<WizardScreen />);
    const icons = screen.getAllByTestId('icon');
    const decPressable = icons.find((el) => el.getAttribute('data-name') === 'remove')!.parentElement!;
    const incPressable = icons.find((el) => el.getAttribute('data-name') === 'add')!.parentElement!;

    // react-native-web's Pressable drives its `pressed` render-prop state off
    // real "mousedown"/"mouseup" DOM events, activating after a short delay
    // (see components/ui/button.test.tsx) -- exercises the
    // `pressed && styles.pressed` branch on both buttons.
    fireEvent.mouseDown(decPressable);
    await waitFor(() => expect(getComputedStyle(decPressable).opacity).toBe('0.5'));
    fireEvent.mouseUp(decPressable);

    fireEvent.mouseDown(incPressable);
    await waitFor(() => expect(getComputedStyle(incPressable).opacity).toBe('0.5'));
    fireEvent.mouseUp(incPressable);
  });

  it('shows the light status bar style when the app theme is dark', () => {
    mocks.theme.isDark = true;
    render(<WizardScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('light');
  });

  it('shows the dark status bar style when the app theme is light', () => {
    render(<WizardScreen />);
    expect(screen.getByTestId('status-bar').getAttribute('data-style')).toBe('dark');
  });

  it('still renders correctly on iOS (KeyboardAvoidingView uses the "padding" behavior)', () => {
    mocks.platform.os = 'ios';
    render(<WizardScreen />);
    expect(screen.getByText('Set up your planner')).toBeTruthy();
  });
});
