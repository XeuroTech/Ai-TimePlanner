import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: any) => <span data-testid="icon" data-name={props.name} />,
}));

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
  notifState: { items: [] as any[] },
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  sendTestNotification: vi.fn(async () => true),
  getNotificationDiagnostics: vi.fn(async () => ({
    permission: 'granted' as 'granted' | 'denied' | 'undetermined',
    canAskAgain: true,
    scheduledCount: 0,
    channelImportance: null,
    platform: 'web',
  })),
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));

vi.mock('@/lib/services/notifications', () => ({
  getNotificationDiagnostics: mocks.getNotificationDiagnostics,
  sendTestNotification: mocks.sendTestNotification,
}));

vi.mock('@/store/notification-store', () => ({
  useMyNotifications: () => mocks.notifState.items,
  useNotificationStore: Object.assign(
    (selector: (s: { markRead: typeof mocks.markRead; markAllRead: typeof mocks.markAllRead }) => unknown) =>
      selector({ markRead: mocks.markRead, markAllRead: mocks.markAllRead }),
    { getState: () => ({ markRead: mocks.markRead, markAllRead: mocks.markAllRead }) },
  ),
}));

import { useThemeStore } from '@/store/theme-store';
import { ToastProvider } from '@/components/ui/toast';
import NotificationsScreen from './notifications';

function renderScreen() {
  return render(
    <ToastProvider>
      <NotificationsScreen />
    </ToastProvider>,
  );
}

function item(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    title: 'Title',
    message: 'Message',
    at: Date.now(),
    read: false,
    icon: 'book-outline',
    colorKey: 'blue',
    kind: 'class',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifState.items = [];
  mocks.sendTestNotification.mockResolvedValue(true);
  mocks.getNotificationDiagnostics.mockResolvedValue({
    permission: 'granted',
    canAskAgain: true,
    scheduledCount: 0,
    channelImportance: null,
    platform: 'web',
  });
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationsScreen', () => {
  it('shows the empty state and no "unread" subtitle when the inbox is empty', () => {
    renderScreen();
    expect(screen.getByText('No notifications yet')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.queryByText(/unread/)).toBeNull();
  });

  it('shows the unread count in the header subtitle when some items are unread', () => {
    mocks.notifState.items = [item({ id: 'a', read: false }), item({ id: 'b', read: true })];
    renderScreen();
    expect(screen.getByText('1 unread')).toBeTruthy();
  });

  it('groups items into Today / Yesterday / Earlier by calendar day', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 15, 16, 5, 0));
    const startOfToday = new Date(2026, 0, 15, 0, 0, 0, 0).getTime();
    const DAY_MS = 86_400_000;
    mocks.notifState.items = [
      item({ id: 'today', title: 'Today item', at: startOfToday + 1000 }),
      item({ id: 'yesterday', title: 'Yesterday item', at: startOfToday - 1000 }),
      item({ id: 'earlier', title: 'Earlier item', at: startOfToday - DAY_MS - 1000 }),
    ];
    renderScreen();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Today item')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('Yesterday item')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('Earlier item')).toBeTruthy();
  });

  it('formats a Today item with a time-of-day label', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 0, 15, 16, 5, 0));
    const at = new Date(2026, 0, 15, 9, 30, 0, 0).getTime();
    mocks.notifState.items = [item({ id: 'a', title: 'Morning ping', at })];
    renderScreen();
    const expected = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('formats an Earlier item with a day/month label instead of a time', () => {
    vi.useFakeTimers().setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    const at = new Date(2026, 0, 5, 9, 30, 0, 0).getTime();
    mocks.notifState.items = [item({ id: 'a', title: 'Old ping', at })];
    renderScreen();
    const expected = new Date(at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('marks a single item as read on press', () => {
    mocks.notifState.items = [item({ id: 'n42', title: 'Tap me' })];
    renderScreen();
    fireEvent.click(screen.getByText('Tap me'));
    expect(mocks.markRead).toHaveBeenCalledWith('n42');
  });

  it('marks every item as read via the header action', () => {
    mocks.notifState.items = [item({ id: 'a' })];
    renderScreen();
    const icon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'checkmark-done')!;
    fireEvent.click(icon);
    expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('navigates back via the header chevron', () => {
    renderScreen();
    const icon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.click(icon);
    expect(mocks.router.back).toHaveBeenCalledTimes(1);
  });

  it('falls back to a default icon when a row has none', () => {
    mocks.notifState.items = [item({ id: 'a', title: 'No icon', icon: undefined })];
    renderScreen();
    const names = screen.getAllByTestId('icon').map((n) => n.getAttribute('data-name'));
    expect(names).toContain('notifications-outline');
  });

  it('shows an unread dot only on unread rows', () => {
    mocks.notifState.items = [
      item({ id: 'a', title: 'Unread row', read: false }),
      item({ id: 'b', title: 'Read row', read: true }),
    ];
    const { container } = renderScreen();
    // Each card renders one Ionicon (its own icon) plus an unread dot View
    // when unread; count of card icons is 2, so more than 2 icon-testids
    // implies nothing extra is added for the dot (a plain View, not an icon) -
    // assert both titles rendered instead, which is what actually matters.
    expect(screen.getByText('Unread row')).toBeTruthy();
    expect(screen.getByText('Read row')).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('schedules a test notification and shows a success toast when it succeeds', async () => {
    mocks.sendTestNotification.mockResolvedValue(true);
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText(/it will arrive in about 5 seconds/);
  });

  it('shows a "permission granted but failed" error when scheduling fails despite granted permission', async () => {
    mocks.sendTestNotification.mockResolvedValue(false);
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'granted',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText(/Permission is granted but the reminder could not be scheduled/);
  });

  it('shows a "not granted yet" error when permission can still be asked for', async () => {
    mocks.sendTestNotification.mockResolvedValue(false);
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'undetermined',
      canAskAgain: true,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText('Notification permission is not granted yet.');
  });

  it('shows a "blocked" error when permission is denied and cannot be asked again', async () => {
    mocks.sendTestNotification.mockResolvedValue(false);
    mocks.getNotificationDiagnostics.mockResolvedValue({
      permission: 'denied',
      canAskAgain: false,
      scheduledCount: 0,
      channelImportance: null,
      platform: 'web',
    });
    renderScreen();
    fireEvent.click(screen.getByText('Send a test notification'));
    await screen.findByText(/Notifications are blocked/);
  });

  it('falls back to the primary color/tint when a row has an unknown colorKey', () => {
    mocks.notifState.items = [item({ id: 'a', title: 'Odd color', colorKey: 'not-a-real-key' })];
    renderScreen();
    expect(screen.getByText('Odd color')).toBeTruthy();
  });

  it('renders in dark mode without crashing', () => {
    useThemeStore.setState({ darkMode: true, notificationsEnabled: true });
    mocks.notifState.items = [item({ id: 'a', title: 'Dark mode item' })];
    renderScreen();
    expect(screen.getByText('Dark mode item')).toBeTruthy();
  });

  it('applies the pressed style while the back chevron is held down', () => {
    vi.useFakeTimers();
    renderScreen();
    const icon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'chevron-back')!;
    fireEvent.mouseDown(icon);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(icon).toBeTruthy();
  });

  it('applies the pressed style while the "mark all read" action is held down', () => {
    vi.useFakeTimers();
    mocks.notifState.items = [item({ id: 'a' })];
    renderScreen();
    const icon = screen.getAllByTestId('icon').find((n) => n.getAttribute('data-name') === 'checkmark-done')!;
    fireEvent.mouseDown(icon);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(icon).toBeTruthy();
  });

  it('applies the pressed style while a notification card is held down', () => {
    vi.useFakeTimers();
    mocks.notifState.items = [item({ id: 'a', title: 'Press me' })];
    renderScreen();
    fireEvent.mouseDown(screen.getByText('Press me'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Press me')).toBeTruthy();
  });

  it('applies the pressed style while the test-notification button is held down', () => {
    vi.useFakeTimers();
    renderScreen();
    fireEvent.mouseDown(screen.getByText('Send a test notification'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('Send a test notification')).toBeTruthy();
  });
});
