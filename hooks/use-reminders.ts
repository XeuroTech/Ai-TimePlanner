/**
 * App-wide notification plumbing, mounted once from `app/_layout.tsx`.
 *
 *  - creates the Android notification channels on start
 *  - registers the foreground/tap listeners that feed the in-app inbox
 *  - rebuilds the reminder schedule whenever the things it depends on change
 *    (classes, plan items, the daily reminder time, or the master toggle)
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import {
  addNotificationListeners,
  ensureNotificationChannels,
  type ReminderData,
} from '@/lib/services/notifications';
import { requestReminderSync } from '@/lib/services/reminders';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationStore } from '@/store/notification-store';
import { usePlannerStore } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';

/** Turns a delivered notification into an inbox row. */
function toInbox(n: Notifications.NotificationRequest, at: number) {
  const data = (n.content.data ?? {}) as ReminderData;
  return {
    id: n.identifier ? `${n.identifier}-${at}` : undefined,
    title: n.content.title ?? 'Reminder',
    message: n.content.body ?? '',
    at,
    icon: data.icon ?? 'notifications-outline',
    colorKey: data.colorKey ?? 'primary',
    kind: data.kind ?? 'reminder',
  };
}

export function useReminders(): void {
  const router = useRouter();
  const addInbox = useNotificationStore((s) => s.add);

  const hydrated = useAuthStore((s) => s.hydrated);
  const uid = useAuthStore((s) => s.fbUser?.uid ?? null);
  const reminderTime = useAuthStore((s) => s.profile?.preferences?.reminderTime);
  const notificationsEnabled = useThemeStore((s) => s.notificationsEnabled);
  const classes = usePlannerStore((s) => s.classes);
  const plans = usePlannerStore((s) => s.plans);

  /* Channels must exist before the first notification is posted. */
  useEffect(() => {
    void ensureNotificationChannels().catch(() => {});
  }, []);

  /* Deliver into the in-app inbox + handle taps. */
  useEffect(() => {
    return addNotificationListeners({
      onReceived: (n) => {
        addInbox(toInbox(n.request, Date.now()));
      },
      onOpened: (response) => {
        addInbox(toInbox(response.notification.request, Date.now()));
        router.push('/notifications');
      },
    });
  }, [addInbox, router]);

  /* Rebuild the schedule when anything it derives from changes. */
  useEffect(() => {
    if (!hydrated) return;
    requestReminderSync();
  }, [hydrated, uid, reminderTime, notificationsEnabled, classes, plans]);
}
