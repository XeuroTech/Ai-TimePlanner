import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));

vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => {}) }));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  authState: {
    profile: { preferences: {} as { reminderTime?: number } },
    updateProfile: vi.fn(async () => {}),
  },
  classes: [] as any[],
  plans: [] as any[],
  getNotificationDiagnostics: vi.fn(async () => ({
    permission: 'granted' as 'granted' | 'denied' | 'undetermined',
    canAskAgain: true,
    scheduledCount: 0,
    channelImportance: null,
    platform: 'web',
  })),
  requestNotificationPermission: vi.fn(async () => 'granted' as 'granted' | 'denied' | 'undetermined'),
  sendTestNotification: vi.fn(async () => true),
  reminderOffsetMinutes: vi.fn((label?: string) => (!label || label === 'None' ? null : 0)),
  syncReminders: vi.fn(async () => ({
    enabled: true,
    classReminders: 0,
    planReminders: 0,
    dailyReminders: 0,
  })),
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));

vi.mock('@/lib/services/notifications', () => ({
  getNotificationDiagnostics: mocks.getNotificationDiagnostics,
  requestNotificationPermission: mocks.requestNotificationPermission,
  sendTestNotification: mocks.sendTestNotification,
}));

vi.mock('@/lib/services/reminders', () => ({
  reminderOffsetMinutes: mocks.reminderOffsetMinutes,
  syncReminders: mocks.syncReminders,
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

vi.mock('@/store/planner-store', () => ({
  useMyClasses: () => mocks.classes,
  useMyPlans: () => mocks.plans,
}));

import { useThemeStore } from '@/store/theme-store';
import { ToastProvider } from '@/components/ui/toast';
import RemindersScreen from './reminders';

function renderScreen() {
  return render(
    <ToastProvider>
      <RemindersScreen />
    </ToastProvider>,
  );
}

function makeClass(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    subject: 'Maths',
    day: 0,
    start: 9 * 60,
    end: 10 * 60,
    reminder: '10 min before',
    color: '#000',
    ...overrides,
  };
}

/**
 * react-native-web's Pressable only flips its `pressed` render-prop to `true` after
 * a short internal delay (50ms, scheduled via setTimeout) following `mousedown`, so a
 * bare mouseDown+mouseUp pair never observes it. Fake timers make that delay
 * deterministic instead of racing a real clock against a possibly-loaded machine.
 * `onPress` itself is wired to the native 'click' event (not to the responder
 * release), so it still fires once real timers are restored.
 */
function pressAndRelease(el: Element) {
  vi.useFakeTimers();
  try {
    fireEvent.mouseDown(el);
    vi.advanceTimersByTime(100);
    fireEvent.mouseUp(el);
  } finally {
    vi.useRealTimers();
  }
  fireEvent.click(el);
}

function makePlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    date: '2999-01-01',
    title: 'Plan item',
    time: 9 * 60,
    done: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.profile = { preferences: {} };
  mocks.classes = [];
  mocks.plans = [];
  mocks.getNotificationDiagnostics.mockResolvedValue({
    permission: 'granted',
    canAskAgain: true,
    scheduledCount: 0,
    channelImportance: null,
    platform: 'web',
  });
  mocks.requestNotificationPermission.mockResolvedValue('granted');
  mocks.sendTestNotification.mockResolvedValue(true);
  mocks.reminderOffsetMinutes.mockImplementation((label?: string) => (!label || label === 'None' ? null : 0));
  mocks.syncReminders.mockResolvedValue({ enabled: true, classReminders: 0, planReminders: 0, dailyReminders: 0 });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('RemindersScreen', () => {
  it('shows "Turned off" in the header when notifications are disabled', () => {
    useThemeStore.setState({ notificationsEnabled: false });
    renderScreen();
    expect(screen.getByText('Turned off')).toBeTruthy();
  });

  it('shows the scheduled count in the header once the engine summary loads', async () => {
    mocks.syncReminders.mockResolvedValue({ enabled: true, classReminders: 2, planReminders: 1, dailyReminders: 1 });
    renderScreen();
    await screen.findByText('4 scheduled');
  });

  it('navigates back via the header chevron and to /notifications via the mail icon', () => {
    renderScreen();
    const icons = screen.getAllByTestId('icon');
    fireEvent.click(icons.find((n) => n.getAttribute('data-name') === 'chevron-back')!);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
    fireEvent.click(icons.find((n) => n.getAttribute('data-name') === 'mail-outline')!);
    expect(mocks.router.push).toHaveBeenCalledWith('/notifications');
  });

  it('starts with the daily nudge off and 8:00 AM as the default time when no preference is saved', () => {
    renderScreen();
    expect(screen.getByText('Off')).toBeTruthy();
    // Time card (with the clock field) is only rendered once the daily toggle is on.
    expect(screen.queryByText('8:00 AM')).toBeNull();
  });

  it('starts with the daily nudge on and the saved time shown when a preference exists', () => {
    mocks.authState.profile = { preferences: { reminderTime: 13 * 60 } };
    renderScreen();
    expect(screen.getByText('Every day at 1:00 PM')).toBeTruthy();
    expect(screen.getByText('1:00 PM')).toBeTruthy();
  });

  it('turns the daily nudge on, persisting the reminder time and showing a success toast', async () => {
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]); // master switch is index 0, daily nudge is index 1
    await waitFor(() =>
      expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ preferences: { reminderTime: 8 * 60 } }),
    );
    expect(await screen.findByText('Daily nudge set for 8:00 AM.')).toBeTruthy();
  });

  it('turns the daily nudge off, clearing the reminder time and showing a confirmation toast', async () => {
    mocks.authState.profile = { preferences: { reminderTime: 8 * 60 } };
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]);
    await waitFor(() =>
      expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ preferences: { reminderTime: undefined } }),
    );
    expect(await screen.findByText('Daily nudge turned off.')).toBeTruthy();
  });

  it('disables the daily-nudge switch while the master switch is off', () => {
    useThemeStore.setState({ notificationsEnabled: false });
    renderScreen();
    const switches = screen.getAllByRole('switch');
    expect((switches[1] as HTMLInputElement).disabled).toBe(true);
  });

  it('picking a preset time persists it immediately when the daily nudge is already on', async () => {
    mocks.authState.profile = { preferences: { reminderTime: 8 * 60 } };
    renderScreen();
    fireEvent.click(screen.getByText('Evening'));
    await waitFor(() =>
      expect(mocks.authState.updateProfile).toHaveBeenCalledWith({ preferences: { reminderTime: 20 * 60 } }),
    );
  });

  it('requests OS permission when the master switch is turned on and it is not yet granted', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'undetermined',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    mocks.requestNotificationPermission.mockResolvedValue('granted');
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await waitFor(() => expect(mocks.requestNotificationPermission).toHaveBeenCalledTimes(1));
    expect(useThemeStore.getState().notificationsEnabled).toBe(true);
  });

  it('shows an error toast when the OS denies the permission request', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.requestNotificationPermission.mockResolvedValue('denied');
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await screen.findByText('Notifications are blocked. Enable them in system settings.');
  });

  it('shows a device-unavailable toast when requesting permission throws', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.requestNotificationPermission.mockRejectedValue(new Error('no native module'));
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    await screen.findByText('Notifications are not available on this device.');
  });

  it('shows the permission warning banner when notifications are on but the OS permission is not granted', async () => {
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'denied',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    await screen.findByText(/Notification permission is not granted/);
  });

  it('shows no permission warning when notifications are off', async () => {
    useThemeStore.setState({ notificationsEnabled: false });
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'denied',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    await waitFor(() => expect(mocks.getNotificationDiagnostics).toHaveBeenCalled());
    expect(screen.queryByText(/Notification permission is not granted/)).toBeNull();
  });

  it('shows the empty state for class reminders when no class has one, and its CTA navigates to /add-class', () => {
    renderScreen();
    expect(screen.getByText('No class reminders')).toBeTruthy();
    fireEvent.click(screen.getByText('Add to Timetable'));
    expect(mocks.router.push).toHaveBeenCalledWith('/add-class');
  });

  it('lists classes with an active reminder, sorted by day then start time', () => {
    mocks.classes = [
      makeClass({ id: 'c2', subject: 'History', day: 1, start: 8 * 60, reminder: 'At start' }),
      makeClass({ id: 'c1', subject: 'Maths', day: 0, start: 9 * 60, reminder: '10 min before' }),
      makeClass({ id: 'c3', subject: 'No reminder', day: 0, start: 7 * 60, reminder: 'None' }),
    ];
    renderScreen();
    expect(screen.queryByText('No class reminders')).toBeNull();
    expect(screen.getByText('Maths')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    // "None" reminder is filtered out by reminderOffsetMinutes -> null.
    expect(screen.queryByText('No reminder')).toBeNull();
  });

  it('shows the empty state for upcoming plans when none exist, and its CTA navigates to /daily-plan', () => {
    renderScreen();
    expect(screen.getByText('Nothing planned')).toBeTruthy();
    fireEvent.click(screen.getByText('Open Daily Plan'));
    expect(mocks.router.push).toHaveBeenCalledWith('/daily-plan');
  });

  it('lists up to 5 upcoming, not-done plans and excludes done or past ones', () => {
    mocks.plans = [
      ...Array.from({ length: 6 }, (_, i) => makePlan({ id: `p${i}`, title: `Plan ${i}`, date: '2999-01-01' })),
      makePlan({ id: 'done', title: 'Already done', done: true }),
      makePlan({ id: 'past', title: 'Long past', date: '2000-01-01' }),
    ];
    renderScreen();
    expect(screen.queryByText('Nothing planned')).toBeNull();
    expect(screen.queryByText('Already done')).toBeNull();
    expect(screen.queryByText('Long past')).toBeNull();
    for (let i = 0; i < 5; i += 1) {
      expect(screen.getByText(`Plan ${i}`)).toBeTruthy();
    }
    expect(screen.queryByText('Plan 5')).toBeNull();
  });

  it('shows the engine footnote with per-kind counts when reminders are enabled', async () => {
    mocks.syncReminders.mockResolvedValue({ enabled: true, classReminders: 2, planReminders: 3, dailyReminders: 1 });
    renderScreen();
    await screen.findByText('Scheduled now: 2 class · 3 plan · 1 daily');
  });

  it('shows the "paused" footnote when disabled specifically for lack of permission', async () => {
    mocks.syncReminders.mockResolvedValue({
      enabled: false,
      reason: 'no-permission',
      classReminders: 0,
      planReminders: 0,
      dailyReminders: 0,
    });
    renderScreen();
    await screen.findByText('Reminders are paused because permission is not granted.');
  });

  it('shows the "turned off" footnote when disabled for any other reason', async () => {
    mocks.syncReminders.mockResolvedValue({
      enabled: false,
      reason: 'disabled',
      classReminders: 0,
      planReminders: 0,
      dailyReminders: 0,
    });
    renderScreen();
    await screen.findByText('Reminders are turned off.');
  });

  it('shows no footnote when the engine summary could not be loaded', async () => {
    mocks.syncReminders.mockRejectedValue(new Error('boom'));
    renderScreen();
    await waitFor(() => expect(mocks.syncReminders).toHaveBeenCalled());
    expect(screen.queryByText(/Scheduled now/)).toBeNull();
    expect(screen.queryByText(/Reminders are/)).toBeNull();
  });

  it('schedules a test notification and shows a success toast', async () => {
    mocks.sendTestNotification.mockResolvedValue(true);
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText('Test reminder scheduled — arriving in about 5 seconds.');
  });

  it('shows an error toast when the test notification fails to schedule', async () => {
    mocks.sendTestNotification.mockResolvedValue(false);
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText('Could not schedule the test reminder.');
  });

  it('shows an error toast when sending the test notification throws', async () => {
    mocks.sendTestNotification.mockRejectedValue(new Error('boom'));
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText('Could not schedule the test reminder.');
  });

  it('falls back to "undetermined" permission when reading notification diagnostics throws', async () => {
    mocks.getNotificationDiagnostics.mockRejectedValue(new Error('native module unavailable'));
    renderScreen();
    await waitFor(() => expect(mocks.getNotificationDiagnostics).toHaveBeenCalled());
    // Permission stays 'undetermined' (its initial value), which — combined with the
    // master switch being on by default — means the warning banner is shown.
    await screen.findByText(/Notification permission is not granted/);
  });

  it('requesting the master switch permission is not attempted when turning it off', async () => {
    renderScreen();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]); // master switch defaults to on; this turns it off
    await waitFor(() => expect(useThemeStore.getState().notificationsEnabled).toBe(false));
    expect(mocks.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('renders the dark-styled status bar when dark mode is enabled', () => {
    useThemeStore.setState({ darkMode: true });
    renderScreen();
    // Smoke check that the screen still renders correctly under dark mode;
    // the StatusBar itself is mocked out, so this exercises the isDark ? 'light' : 'dark' branch.
    expect(screen.getByText('Reminders')).toBeTruthy();
  });

  it('sorts same-day classes by start time', () => {
    mocks.classes = [
      makeClass({ id: 'c1', subject: 'Later', day: 2, start: 11 * 60, reminder: '10 min before' }),
      makeClass({ id: 'c2', subject: 'Earlier', day: 2, start: 8 * 60, reminder: '10 min before' }),
    ];
    renderScreen();
    const names = screen.getAllByText(/Earlier|Later/).map((n) => n.textContent);
    expect(names).toEqual(['Earlier', 'Later']);
  });

  it('falls back to "—" for a class whose day index is out of range', () => {
    mocks.classes = [makeClass({ id: 'c1', subject: 'Odd Day', day: 9, reminder: 'At start' })];
    renderScreen();
    expect(screen.getByText(/— ·/)).toBeTruthy();
  });

  it('applies the pressed style and still navigates when the header back button is pressed and released', async () => {
    renderScreen();
    const backIcon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'chevron-back')!;
    await pressAndRelease(backIcon);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('applies the pressed style and still navigates when the header mail button is pressed and released', async () => {
    renderScreen();
    const mailIcon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'mail-outline')!;
    await pressAndRelease(mailIcon);
    expect(mocks.router.push).toHaveBeenCalledWith('/notifications');
  });

  it('applies the pressed style and still requests permission when the warning banner is pressed and released', async () => {
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'denied',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    const banner = await screen.findByText(/Notification permission is not granted/);
    await pressAndRelease(banner);
    await waitFor(() => expect(mocks.requestNotificationPermission).toHaveBeenCalledTimes(1));
  });

  it('applies the pressed style and still sends the test notification when it is pressed and released', async () => {
    renderScreen();
    const testBtn = screen.getByText('Send a test notification');
    await pressAndRelease(testBtn);
    await screen.findByText('Test reminder scheduled — arriving in about 5 seconds.');
  });

  it('renders the pressed opacity style on the header back button while held down', async () => {
    renderScreen();
    const backIcon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'chevron-back')!;
    const backBtn = backIcon.parentElement!;
    fireEvent.mouseDown(backBtn);
    await waitFor(() => expect(getComputedStyle(backBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(backBtn);
  });

  it('renders the pressed opacity style on the header mail button while held down', async () => {
    renderScreen();
    const mailIcon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'mail-outline')!;
    const mailBtn = mailIcon.parentElement!;
    fireEvent.mouseDown(mailBtn);
    await waitFor(() => expect(getComputedStyle(mailBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(mailBtn);
  });

  it('renders the pressed opacity style on the permission warning banner while held down', async () => {
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'denied',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    const banner = await screen.findByText(/Notification permission is not granted/);
    const bannerBtn = banner.parentElement!;
    fireEvent.mouseDown(bannerBtn);
    await waitFor(() => expect(getComputedStyle(bannerBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(bannerBtn);
  });

  it('renders the pressed opacity style on the test-notification button while held down', async () => {
    renderScreen();
    const testBtn = screen.getByText('Send a test notification').parentElement!;
    fireEvent.mouseDown(testBtn);
    await waitFor(() => expect(getComputedStyle(testBtn).opacity).toBe('0.5'), { timeout: 3000 });
    fireEvent.mouseUp(testBtn);
  });
});
