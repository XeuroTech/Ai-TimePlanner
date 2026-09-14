/**
 * Low-level expo-notifications wrapper: permission, Android channels,
 * scheduling primitives and listener registration.
 *
 * Domain logic (what gets a reminder and when) lives in
 * `lib/services/reminders.ts`.
 *
 * Why notifications were silent before this file grew up:
 *  1. Nothing was ever scheduled — only permission was requested.
 *  2. The Android channel was created *inside* the permission request, so a
 *     user who had already granted permission never got a channel. On Android
 *     8+ a notification posted to a missing channel is dropped silently.
 *  3. No listeners were registered, so nothing reached the in-app inbox.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** All app reminders go through this channel so users can tune it in one place. */
export const REMINDER_CHANNEL_ID = 'reminders';

/**
 * Decides what happens when a notification arrives while the app is open.
 * Registered at module scope so it is in place before anything can fire.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/* -------------------------------------------------------------------------- */
/* Channels                                                                   */
/* -------------------------------------------------------------------------- */

let channelsReady: Promise<void> | null = null;

/**
 * Creates the Android notification channels. Idempotent and safe to call on
 * every app start — Android updates the existing channel rather than
 * duplicating it. No-op on iOS/web.
 */
export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelsReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Reminders',
      description: 'Class, plan and daily planning reminders.',
      // HIGH (not DEFAULT) so the reminder actually pops up as a heads-up banner.
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      sound: 'default',
    });
    // Keep the legacy 'default' channel around for anything already using it.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  })().catch((err) => {
    channelsReady = null; // allow a retry on the next call
    throw err;
  });
  return channelsReady;
}

/* -------------------------------------------------------------------------- */
/* Permission                                                                 */
/* -------------------------------------------------------------------------- */

export async function getNotificationPermission(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Requests OS notification permission (and prepares channels). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  // Channels must exist before the first notification is posted, regardless of
  // whether we end up showing a permission prompt.
  await ensureNotificationChannels().catch(() => {});

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (!current.canAskAgain) return current.status;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status;
}

/** True when the OS will actually deliver notifications right now. */
export async function canDeliverNotifications(): Promise<boolean> {
  return (await getNotificationPermission()) === 'granted';
}

/* -------------------------------------------------------------------------- */
/* Scheduling primitives                                                      */
/* -------------------------------------------------------------------------- */

export type ReminderKind = 'class' | 'plan' | 'daily' | 'test';

/** Payload attached to every notification we schedule. */
export type ReminderData = {
  kind: ReminderKind;
  /** id of the class / plan item it came from, when applicable. */
  refId?: string;
  /** Ionicon name + palette key so the in-app inbox can style the row. */
  icon?: string;
  colorKey?: string;
};

type ScheduleContent = {
  title: string;
  body: string;
  data: ReminderData;
};

function content(c: ScheduleContent): Notifications.NotificationContentInput {
  return {
    title: c.title,
    body: c.body,
    data: c.data as unknown as Record<string, unknown>,
    sound: 'default',
    ...(Platform.OS === 'android' ? { priority: 'high', vibrate: [0, 250, 250, 250] } : null),
  };
}

/** Fires every day at `hour`:`minute` local time. */
export async function scheduleDaily(
  c: ScheduleContent,
  hour: number,
  minute: number,
): Promise<string | null> {
  return schedule(c, {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    channelId: REMINDER_CHANNEL_ID,
  });
}

/** Fires weekly. `weekday` is 1 = Sunday … 7 = Saturday (expo's convention). */
export async function scheduleWeekly(
  c: ScheduleContent,
  weekday: number,
  hour: number,
  minute: number,
): Promise<string | null> {
  return schedule(c, {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday,
    hour,
    minute,
    channelId: REMINDER_CHANNEL_ID,
  });
}

/** Fires once at an absolute date. Silently skips dates in the past. */
export async function scheduleOnce(c: ScheduleContent, date: Date): Promise<string | null> {
  if (date.getTime() <= Date.now() + 1000) return null;
  return schedule(c, {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    channelId: REMINDER_CHANNEL_ID,
  });
}

async function schedule(
  c: ScheduleContent,
  trigger: Notifications.NotificationTriggerInput,
): Promise<string | null> {
  try {
    await ensureNotificationChannels();
    return await Notifications.scheduleNotificationAsync({ content: content(c), trigger });
  } catch {
    // A single bad reminder must never break a save or an app start.
    return null;
  }
}

/**
 * Schedules a one-off notification ~5s out, so a user can confirm delivery
 * actually works on their device without waiting for a real reminder.
 */
export async function sendTestNotification(): Promise<boolean> {
  const id = await scheduleOnce(
    {
      title: 'Test notification',
      body: 'This is what your reminders will look like.',
      data: { kind: 'test' },
    },
    new Date(Date.now() + 5000),
  );
  return id !== null;
}

/* -------------------------------------------------------------------------- */
/* Inspecting & cancelling                                                    */
/* -------------------------------------------------------------------------- */

export async function listScheduled(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return [];
  }
}

export async function cancelNotification(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* already gone */
  }
}

export async function cancelAllScheduled(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* nothing to cancel */
  }
}

/** Cancels only the reminders this app scheduled for the given kinds. */
export async function cancelByKind(kinds: ReminderKind[]): Promise<void> {
  const wanted = new Set<ReminderKind>(kinds);
  const scheduled = await listScheduled();
  await Promise.all(
    scheduled
      .filter((req) => {
        const kind = (req.content.data as ReminderData | undefined)?.kind;
        return !!kind && wanted.has(kind);
      })
      .map((req) => cancelNotification(req.identifier)),
  );
}

/* -------------------------------------------------------------------------- */
/* Listeners                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Registers foreground + tap listeners. Returns a cleanup function, so the
 * caller can use it directly from a `useEffect`.
 */
export function addNotificationListeners(handlers: {
  /** Fired when a notification is delivered while the app is running. */
  onReceived?: (n: Notifications.Notification) => void;
  /** Fired when the user taps a notification (app may have been killed). */
  onOpened?: (r: Notifications.NotificationResponse) => void;
}): () => void {
  const received = handlers.onReceived
    ? Notifications.addNotificationReceivedListener(handlers.onReceived)
    : null;
  const opened = handlers.onOpened
    ? Notifications.addNotificationResponseReceivedListener(handlers.onOpened)
    : null;

  return () => {
    received?.remove();
    opened?.remove();
  };
}

/** The notification that launched the app from a cold start, if any. */
export async function getInitialNotification(): Promise<Notifications.NotificationResponse | null> {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

export type NotificationDiagnostics = {
  permission: PermissionState;
  canAskAgain: boolean;
  scheduledCount: number;
  channelImportance: number | null;
  platform: string;
};

/** Everything needed to explain "why am I not seeing notifications?". */
export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const perms = await Notifications.getPermissionsAsync().catch(() => null);
  const scheduled = await listScheduled();

  let channelImportance: number | null = null;
  if (Platform.OS === 'android') {
    try {
      await ensureNotificationChannels();
      const ch = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL_ID);
      channelImportance = ch?.importance ?? null;
    } catch {
      channelImportance = null;
    }
  }

  return {
    permission: perms?.status ?? 'undetermined',
    canAskAgain: perms?.canAskAgain ?? true,
    scheduledCount: scheduled.length,
    channelImportance,
    platform: Platform.OS,
  };
}
