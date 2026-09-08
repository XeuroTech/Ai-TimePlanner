import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn() },
  notifications: {
    ensureNotificationChannels: vi.fn(async () => {}),
    addNotificationListeners: vi.fn((_handlers: any) => vi.fn()),
  },
  requestReminderSync: vi.fn(),
  authState: { hydrated: true, fbUser: { uid: 'u1' } as { uid: string } | null, profile: null as any },
  themeState: { notificationsEnabled: true },
  plannerState: { classes: [] as any[], plans: [] as any[] },
  addInbox: vi.fn(),
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('expo-notifications', () => ({}));
vi.mock('@/lib/services/notifications', () => mocks.notifications);
vi.mock('@/lib/services/reminders', () => ({ requestReminderSync: mocks.requestReminderSync }));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {}),
}));
vi.mock('@/store/notification-store', () => ({
  useNotificationStore: Object.assign((selector: (s: { add: typeof mocks.addInbox }) => unknown) => selector({ add: mocks.addInbox }), {}),
}));
vi.mock('@/store/planner-store', () => ({
  usePlannerStore: Object.assign((selector: (s: typeof mocks.plannerState) => unknown) => selector(mocks.plannerState), {}),
}));
vi.mock('@/store/theme-store', () => ({
  useThemeStore: Object.assign((selector: (s: typeof mocks.themeState) => unknown) => selector(mocks.themeState), {}),
}));

import { useReminders } from './use-reminders';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.hydrated = true;
  mocks.authState.fbUser = { uid: 'u1' };
  mocks.authState.profile = null;
  mocks.themeState.notificationsEnabled = true;
  mocks.plannerState.classes = [];
  mocks.plannerState.plans = [];
  mocks.notifications.addNotificationListeners.mockReturnValue(vi.fn());
});

describe('useReminders', () => {
  it('ensures notification channels exist on mount', () => {
    renderHook(() => useReminders());
    expect(mocks.notifications.ensureNotificationChannels).toHaveBeenCalledTimes(1);
  });

  it('swallows a failure creating notification channels', async () => {
    mocks.notifications.ensureNotificationChannels.mockRejectedValueOnce(new Error('no permission'));
    expect(() => renderHook(() => useReminders())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('registers notification listeners once and unregisters them on unmount', () => {
    const unsubscribe = vi.fn();
    mocks.notifications.addNotificationListeners.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useReminders());
    expect(mocks.notifications.addNotificationListeners).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('routes a received notification into the in-app inbox', () => {
    renderHook(() => useReminders());
    const { onReceived } = mocks.notifications.addNotificationListeners.mock.calls[0][0];
    onReceived({ request: { identifier: 'n1', content: { title: 'Hi', body: 'B', data: { kind: 'class', icon: 'book', colorKey: 'blue' } } } });
    expect(mocks.addInbox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hi', message: 'B', kind: 'class', icon: 'book', colorKey: 'blue' }),
    );
  });

  it('applies defaults when a received notification carries no data', () => {
    renderHook(() => useReminders());
    const { onReceived } = mocks.notifications.addNotificationListeners.mock.calls[0][0];
    onReceived({ request: { identifier: null, content: { title: null, body: null, data: null } } });
    expect(mocks.addInbox).toHaveBeenCalledWith(
      expect.objectContaining({ id: undefined, title: 'Reminder', message: '', icon: 'notifications-outline', colorKey: 'primary', kind: 'reminder' }),
    );
  });

  it('routes a tapped notification into the inbox and navigates to the notifications screen', () => {
    renderHook(() => useReminders());
    const { onOpened } = mocks.notifications.addNotificationListeners.mock.calls[0][0];
    onOpened({ notification: { request: { identifier: 'n2', content: { title: 'Tap', body: 'B', data: {} } } } });
    expect(mocks.addInbox).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tap' }));
    expect(mocks.router.push).toHaveBeenCalledWith('/notifications');
  });

  it('resyncs reminders once auth has hydrated', () => {
    renderHook(() => useReminders());
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(1);
  });

  it('does not resync reminders before auth has hydrated', () => {
    mocks.authState.hydrated = false;
    renderHook(() => useReminders());
    expect(mocks.requestReminderSync).not.toHaveBeenCalled();
  });

  it('resyncs again when a dependency (e.g. the class list) changes', () => {
    const { rerender } = renderHook(() => useReminders());
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(1);
    mocks.plannerState.classes = [{ id: 'c1' }];
    rerender();
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(2);
  });

  it('does not resync again when nothing relevant changed', () => {
    const { rerender } = renderHook(() => useReminders());
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(1);
    rerender();
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(1);
  });

  it('still resyncs when no user is signed in (uid falls back to null)', () => {
    mocks.authState.fbUser = null;
    renderHook(() => useReminders());
    expect(mocks.requestReminderSync).toHaveBeenCalledTimes(1);
  });
});
