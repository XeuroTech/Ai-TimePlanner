import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * reminders.ts reaches into the notifications service (a thin wrapper around
 * expo-notifications/react-native) and three zustand stores purely to read
 * current state and fire scheduling calls. None of that native machinery is
 * needed to verify the scheduling *decisions* this module makes, so it's all
 * replaced with inspectable fakes.
 */
const mocks = vi.hoisted(() => ({
  notifications: {
    cancelAllScheduled: vi.fn(async () => {}),
    cancelByKind: vi.fn(async () => {}),
    getNotificationPermission: vi.fn(async () => 'granted' as 'granted' | 'denied' | 'undetermined'),
    scheduleDaily: vi.fn(async () => 'id' as string | null),
    scheduleOnce: vi.fn(async (_content?: unknown, _date?: Date) => 'id' as string | null),
    scheduleWeekly: vi.fn(async () => 'id' as string | null),
  },
  authState: { fbUser: { uid: 'u1' } as { uid: string } | null, profile: null as any },
  plannerState: { classes: [] as any[], plans: [] as any[] },
  themeState: { notificationsEnabled: true },
}));

vi.mock('@/lib/services/notifications', () => mocks.notifications);
vi.mock('@/store/auth-store', () => ({ useAuthStore: { getState: () => mocks.authState } }));
vi.mock('@/store/planner-store', () => ({ usePlannerStore: { getState: () => mocks.plannerState } }));
vi.mock('@/store/theme-store', () => ({ useThemeStore: { getState: () => mocks.themeState } }));

import { reminderOffsetMinutes, requestReminderSync, syncReminders } from './reminders';

const baseClass = { id: 'c1', uid: 'u1', subject: 'Math', day: 0, start: 540, end: 600, color: '#111' };

beforeEach(() => {
  mocks.authState.fbUser = { uid: 'u1' };
  mocks.authState.profile = null;
  mocks.plannerState.classes = [];
  mocks.plannerState.plans = [];
  mocks.themeState.notificationsEnabled = true;
  vi.clearAllMocks();
  mocks.notifications.getNotificationPermission.mockResolvedValue('granted');
  mocks.notifications.scheduleDaily.mockResolvedValue('id');
  mocks.notifications.scheduleOnce.mockResolvedValue('id');
  mocks.notifications.scheduleWeekly.mockResolvedValue('id');
});

describe('reminderOffsetMinutes', () => {
  it('returns null when no reminder was chosen', () => {
    expect(reminderOffsetMinutes(undefined)).toBeNull();
    expect(reminderOffsetMinutes('None')).toBeNull();
  });

  it('resolves every known label to its offset in minutes', () => {
    expect(reminderOffsetMinutes('At start')).toBe(0);
    expect(reminderOffsetMinutes('10 min before')).toBe(10);
    expect(reminderOffsetMinutes('30 min before')).toBe(30);
    expect(reminderOffsetMinutes('1 hour before')).toBe(60);
  });

  it('falls back to 0 for an unrecognized label', () => {
    expect(reminderOffsetMinutes('some custom label')).toBe(0);
  });
});

describe('syncReminders — gating', () => {
  it('cancels everything and reports disabled when reminders are turned off', async () => {
    mocks.themeState.notificationsEnabled = false;
    const result = await syncReminders();
    expect(result).toEqual({ enabled: false, reason: 'disabled', classReminders: 0, planReminders: 0, dailyReminders: 0 });
    expect(mocks.notifications.cancelAllScheduled).toHaveBeenCalledTimes(1);
    expect(mocks.notifications.cancelByKind).not.toHaveBeenCalled();
  });

  it('cancels everything and reports no-permission when the OS denies it', async () => {
    mocks.notifications.getNotificationPermission.mockResolvedValue('denied');
    const result = await syncReminders();
    expect(result).toEqual({ enabled: false, reason: 'no-permission', classReminders: 0, planReminders: 0, dailyReminders: 0 });
    expect(mocks.notifications.cancelAllScheduled).toHaveBeenCalledTimes(1);
  });

  it('wipes only this app\'s reminder kinds and returns all-zero counts when there is nothing to schedule', async () => {
    const result = await syncReminders();
    expect(result).toEqual({ enabled: true, classReminders: 0, planReminders: 0, dailyReminders: 0 });
    expect(mocks.notifications.cancelByKind).toHaveBeenCalledWith(['class', 'plan', 'daily']);
  });
});

describe('syncReminders — daily nudge', () => {
  it('schedules the daily nudge at the profile\'s reminder time', async () => {
    mocks.authState.profile = { preferences: { reminderTime: 9 * 60 + 10 } };
    const result = await syncReminders();
    expect(mocks.notifications.scheduleDaily).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Plan your day' }),
      9,
      10,
    );
    expect(result.dailyReminders).toBe(1);
  });

  it('does not count the nudge when the OS refuses to schedule it', async () => {
    mocks.authState.profile = { preferences: { reminderTime: 600 } };
    mocks.notifications.scheduleDaily.mockResolvedValue(null);
    const result = await syncReminders();
    expect(result.dailyReminders).toBe(0);
  });

  it('skips the nudge entirely when no reminder time is set', async () => {
    mocks.authState.profile = { preferences: {} };
    await syncReminders();
    expect(mocks.notifications.scheduleDaily).not.toHaveBeenCalled();
  });
});

describe('syncReminders — class reminders', () => {
  it('skips a class whose reminder is "None"', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'None' }];
    const result = await syncReminders();
    expect(result.classReminders).toBe(0);
    expect(mocks.notifications.scheduleDaily).not.toHaveBeenCalled();
    expect(mocks.notifications.scheduleWeekly).not.toHaveBeenCalled();
  });

  it('ignores classes belonging to a different user', async () => {
    mocks.plannerState.classes = [{ ...baseClass, uid: 'someone-else', reminder: 'At start' }];
    const result = await syncReminders();
    expect(result.classReminders).toBe(0);
  });

  it('a Daily-repeat class schedules via scheduleDaily, with room appended to the body', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Daily', room: 'B12' }];
    const result = await syncReminders();
    expect(mocks.notifications.scheduleDaily).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Math', body: 'Starting now · B12' }),
      9,
      0,
    );
    expect(mocks.notifications.scheduleWeekly).not.toHaveBeenCalled();
    expect(result.classReminders).toBe(1);
  });

  it('an offset > 0 uses the "Starts at" body and omits the room when absent', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: '10 min before', repeat: 'Daily' }];
    await syncReminders();
    expect(mocks.notifications.scheduleDaily).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Starts at 9:00 AM' }),
      8,
      50,
    );
  });

  it('rolls a reminder that lands before midnight back into the previous day', async () => {
    // start=5, offset=60 ("1 hour before") => 5 - 60 = -55, which wraps to 23:05.
    mocks.plannerState.classes = [{ ...baseClass, start: 5, reminder: '1 hour before', repeat: 'Daily' }];
    await syncReminders();
    expect(mocks.notifications.scheduleDaily).toHaveBeenCalledWith(expect.anything(), 23, 5);
  });

  it('a Never-repeat class schedules a single one-off via scheduleOnce', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Never' }];
    const result = await syncReminders();
    expect(mocks.notifications.scheduleOnce).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Math' }),
      expect.any(Date),
    );
    expect(result.classReminders).toBe(1);
  });

  it('does not count a Daily-repeat class when the OS refuses to schedule it', async () => {
    mocks.notifications.scheduleDaily.mockResolvedValue(null);
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Daily' }];
    const result = await syncReminders();
    expect(result.classReminders).toBe(0);
  });

  it('does not count a Never-repeat class when the OS refuses to schedule it', async () => {
    mocks.notifications.scheduleOnce.mockResolvedValue(null);
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Never' }];
    const result = await syncReminders();
    expect(result.classReminders).toBe(0);
  });

  it('defaults to Weekly (repeat unset) and maps the app weekday to Expo\'s numbering', async () => {
    mocks.plannerState.classes = [{ ...baseClass, day: 0, reminder: 'At start' }]; // Monday
    await syncReminders();
    // App Monday (0) -> Expo weekday 2 (1 = Sunday ... 7 = Saturday)
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledWith(expect.anything(), 2, 9, 0);
  });

  it('maps Sunday (app day 6) to Expo weekday 1', async () => {
    mocks.plannerState.classes = [{ ...baseClass, day: 6, reminder: 'At start' }];
    await syncReminders();
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledWith(expect.anything(), 1, expect.any(Number), expect.any(Number));
  });

  it('a Never-repeat class on a Sunday schedules the next matching Sunday, not the current weekday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 8, 0, 0)); // Monday Jan 5 2026, 8:00 AM
    try {
      mocks.plannerState.classes = [{ ...baseClass, day: 6, reminder: 'At start', repeat: 'Never' }]; // Sunday
      const result = await syncReminders();
      expect(mocks.notifications.scheduleOnce).toHaveBeenCalledWith(expect.anything(), expect.any(Date));
      const scheduledFor = mocks.notifications.scheduleOnce.mock.calls[0][1] as Date;
      // From Monday, the next Sunday is 6 days later.
      expect(scheduledFor.getDate()).toBe(11);
      expect(result.classReminders).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Never-repeat class whose time today has already passed rolls to the same weekday next week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 9, 0, 0)); // Monday Jan 5 2026, 9:00 AM
    try {
      // day=0 (Monday), start=8:00 AM — today's slot, but already in the past.
      mocks.plannerState.classes = [
        { ...baseClass, day: 0, start: 8 * 60, reminder: 'At start', repeat: 'Never' },
      ];
      const result = await syncReminders();
      expect(mocks.notifications.scheduleOnce).toHaveBeenCalledWith(expect.anything(), expect.any(Date));
      const scheduledFor = mocks.notifications.scheduleOnce.mock.calls[0][1] as Date;
      // Rolls a full week forward rather than firing "in the past" today.
      expect(scheduledFor.getDate()).toBe(12);
      expect(result.classReminders).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes a plan whose date overflows into an invalid Date', async () => {
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: '999999-01-01', title: 'Study', time: 600, done: false },
    ];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
    expect(mocks.notifications.scheduleOnce).not.toHaveBeenCalled();
  });

  it('falls back to uid "anon" when no user is signed in', async () => {
    mocks.authState.fbUser = null;
    mocks.plannerState.classes = [{ ...baseClass, uid: 'anon', reminder: 'At start' }];
    const result = await syncReminders();
    expect(result.classReminders).toBe(1);
  });

  it('includes the room in the "Starts at" body when an offset is used and a room is set', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: '10 min before', repeat: 'Daily', room: 'B12' }];
    await syncReminders();
    expect(mocks.notifications.scheduleDaily).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Starts at 9:00 AM · B12' }),
      8,
      50,
    );
  });

  it('a Weekdays-repeat class schedules Monday through Friday, 5 calls total', async () => {
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Weekdays' }];
    const result = await syncReminders();
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledTimes(5);
    expect(result.classReminders).toBe(5);
  });

  it('does not count a Weekdays day when the OS refuses to schedule it', async () => {
    mocks.notifications.scheduleWeekly.mockResolvedValue(null);
    mocks.plannerState.classes = [{ ...baseClass, reminder: 'At start', repeat: 'Weekdays' }];
    const result = await syncReminders();
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledTimes(5);
    expect(result.classReminders).toBe(0);
  });

  it('a Weekdays class stops mid-week once the outer budget runs out', async () => {
    // 53 filler classes each spend 1 of the 56-slot budget, leaving 3 for the
    // 5-day Weekdays class below — so it schedules Mon/Tue/Wed and stops there.
    const filler = Array.from({ length: 53 }, (_, i) => ({
      ...baseClass,
      id: `f${i}`,
      reminder: 'At start',
      repeat: 'Weekly',
    }));
    const weekdaysClass = { ...baseClass, id: 'wd', reminder: 'At start', repeat: 'Weekdays' };
    mocks.plannerState.classes = [...filler, weekdaysClass];

    const result = await syncReminders();
    expect(result.classReminders).toBe(56);
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledTimes(56);
  });

  it('caps total class reminders at the internal scheduling budget', async () => {
    mocks.plannerState.classes = Array.from({ length: 60 }, (_, i) => ({
      ...baseClass,
      id: `c${i}`,
      reminder: 'At start',
      repeat: 'Weekly',
    }));
    const result = await syncReminders();
    // 60 classes each want exactly one weekly reminder, but the OS-imposed
    // pending-notification budget (56, see MAX_SCHEDULED in reminders.ts) caps it.
    expect(result.classReminders).toBe(56);
    expect(mocks.notifications.scheduleWeekly).toHaveBeenCalledTimes(56);
    // The budget is fully spent, so the plan loop that runs after gets nothing.
    expect(result.planReminders).toBe(0);
  });
});

describe('syncReminders — plan reminders', () => {
  const future = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000);
  const dateKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

  it('schedules a future, not-done plan belonging to the current user', async () => {
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study session', time: minutesOf(when), done: false },
    ];
    const result = await syncReminders();
    expect(mocks.notifications.scheduleOnce).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Study session' }),
      expect.any(Date),
    );
    expect(result.planReminders).toBe(1);
  });

  it('includes the note in the body when present, and omits it when absent', async () => {
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: false, note: 'Bring notes' },
    ];
    await syncReminders();
    expect(mocks.notifications.scheduleOnce).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Bring notes') }),
      expect.any(Date),
    );
  });

  it('excludes a plan that is already done', async () => {
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: true },
    ];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
    expect(mocks.notifications.scheduleOnce).not.toHaveBeenCalled();
  });

  it('excludes a plan belonging to a different user', async () => {
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'someone-else', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: false },
    ];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
  });

  it('excludes a plan whose date is unparsable', async () => {
    mocks.plannerState.plans = [{ id: 'p1', uid: 'u1', date: 'not-a-date', title: 'Study', time: 600, done: false }];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
  });

  it('excludes a plan already in the past', async () => {
    const when = new Date(Date.now() - 3_600_000);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: false },
    ];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
  });

  it('does not count a plan when the OS refuses to schedule it', async () => {
    mocks.notifications.scheduleOnce.mockResolvedValue(null);
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: false },
    ];
    const result = await syncReminders();
    expect(result.planReminders).toBe(0);
  });

  it('schedules nothing when the class reminders already exhausted the budget', async () => {
    mocks.plannerState.classes = Array.from({ length: 60 }, (_, i) => ({
      ...baseClass,
      id: `c${i}`,
      reminder: 'At start',
      repeat: 'Weekly',
    }));
    const when = future(2);
    mocks.plannerState.plans = [
      { id: 'p1', uid: 'u1', date: dateKeyOf(when), title: 'Study', time: minutesOf(when), done: false },
    ];
    const result = await syncReminders();
    expect(result.classReminders).toBe(56);
    expect(result.planReminders).toBe(0);
    expect(mocks.notifications.scheduleOnce).not.toHaveBeenCalled();
  });

  it('schedules the nearest plan first', async () => {
    const soon = future(1);
    const later = future(5);
    mocks.plannerState.plans = [
      { id: 'p-later', uid: 'u1', date: dateKeyOf(later), title: 'Later', time: minutesOf(later), done: false },
      { id: 'p-soon', uid: 'u1', date: dateKeyOf(soon), title: 'Soon', time: minutesOf(soon), done: false },
    ];
    await syncReminders();
    const titles = mocks.notifications.scheduleOnce.mock.calls.map((call) => (call[0] as any).title);
    expect(titles).toEqual(['Soon', 'Later']);
  });
});

describe('requestReminderSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a sync after the requested delay', async () => {
    requestReminderSync(100);
    expect(mocks.notifications.cancelByKind).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.notifications.cancelByKind).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid-fire calls into a single sync', async () => {
    requestReminderSync(200);
    requestReminderSync(200);
    requestReminderSync(200);
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.notifications.cancelByKind).toHaveBeenCalledTimes(1);
  });

  it('defaults to a 400ms delay when none is given', async () => {
    requestReminderSync();
    await vi.advanceTimersByTimeAsync(399);
    expect(mocks.notifications.cancelByKind).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.notifications.cancelByKind).toHaveBeenCalledTimes(1);
  });

  it('queues exactly one more sync when a request arrives mid-rebuild', async () => {
    let releaseFirst = () => {};
    const stalledPermission = new Promise<'granted'>((resolve) => {
      releaseFirst = () => resolve('granted');
    });
    mocks.notifications.getNotificationPermission.mockImplementationOnce(() => stalledPermission);

    requestReminderSync(0);
    await vi.advanceTimersByTimeAsync(0); // first sync starts and stalls on the permission check

    requestReminderSync(0); // arrives while the first rebuild is still in flight
    await vi.advanceTimersByTimeAsync(0); // this timer sees inFlight and queues a rerun instead of starting one
    expect(mocks.notifications.cancelByKind).not.toHaveBeenCalled();

    releaseFirst();
    await vi.runAllTimersAsync(); // let the first run finish, then its queued rerun fire and finish too

    expect(mocks.notifications.cancelByKind).toHaveBeenCalledTimes(2);
  });

  it('swallows a rejected sync so it never surfaces as an unhandled rejection', async () => {
    mocks.notifications.getNotificationPermission.mockRejectedValueOnce(new Error('permission check failed'));
    requestReminderSync(0);
    await vi.runAllTimersAsync();
    // No assertion beyond "this did not throw / reject unhandled" — the
    // .catch(() => {}) in requestReminderSync exists precisely to guarantee that.
  });
});
