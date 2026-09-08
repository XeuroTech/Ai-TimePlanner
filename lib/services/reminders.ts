/**
 * The reminders engine: decides *what* gets a notification and *when*, then
 * hands the work to `lib/services/notifications.ts`.
 *
 * Strategy: rather than tracking a notification id per item (which drifts out
 * of sync the moment anything is edited elsewhere), the whole schedule is
 * rebuilt from current state. `syncReminders()` cancels everything this app
 * scheduled and re-creates it. It is cheap, idempotent, and always correct.
 *
 * Sources of reminders:
 *  - `PlanClass.reminder` ("At start", "10 min before", …) + `PlanClass.repeat`
 *  - `PlanItem` daily-plan entries (one-off, at their exact date + time)
 *  - `UserProfile.reminderTime` — the daily "plan your day" nudge
 */
import { clampMinutes, formatTime, MINUTES_PER_DAY } from '@/lib/time';
import {
  cancelAllScheduled,
  cancelByKind,
  getNotificationPermission,
  scheduleDaily,
  scheduleOnce,
  scheduleWeekly,
} from '@/lib/services/notifications';
import { useAuthStore } from '@/store/auth-store';
import { PlanClass, PlanItem, usePlannerStore } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';

/* -------------------------------------------------------------------------- */
/* Reminder offsets                                                           */
/* -------------------------------------------------------------------------- */

export const REMINDER_OPTIONS = [
  'None',
  'At start',
  '10 min before',
  '30 min before',
  '1 hour before',
] as const;

export type ReminderOption = (typeof REMINDER_OPTIONS)[number];

const OFFSETS: Record<string, number> = {
  'At start': 0,
  '10 min before': 10,
  '30 min before': 30,
  '1 hour before': 60,
};

/** Minutes before the event, or `null` when the user chose "None". */
export function reminderOffsetMinutes(label?: string): number | null {
  if (!label || label === 'None') return null;
  return OFFSETS[label] ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Weekday helpers                                                            */
/* -------------------------------------------------------------------------- */

/** App days are 0 = Monday … 6 = Sunday. Expo wants 1 = Sunday … 7 = Saturday. */
function toExpoWeekday(appDay: number): number {
  const d = ((appDay % 7) + 7) % 7;
  return d === 6 ? 1 : d + 2;
}

const WEEKDAY_DAYS = [0, 1, 2, 3, 4]; // Mon–Fri

/**
 * Shifts an event's (day, minute) back by `offset` minutes, rolling over to the
 * previous day when the reminder lands before midnight.
 */
function shiftBack(appDay: number, minutes: number, offset: number): { day: number; minutes: number } {
  let m = minutes - offset;
  let day = appDay;
  while (m < 0) {
    m += MINUTES_PER_DAY;
    day = (day + 6) % 7;
  }
  return { day, minutes: m };
}

/** Next future Date matching an app weekday + minutes-from-midnight. */
function nextOccurrence(appDay: number, minutes: number, from = new Date()): Date {
  const targetJsDay = appDay === 6 ? 0 : appDay + 1; // JS: 0 = Sunday
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  let delta = (targetJsDay - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= from.getTime()) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/** Parses a `YYYY-MM-DD` key + minutes into a local Date. */
function dateAt(dateKey: string, minutes: number): Date | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  const out = new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

/* -------------------------------------------------------------------------- */
/* Sync                                                                       */
/* -------------------------------------------------------------------------- */

export type SyncResult = {
  /** False when the user turned reminders off or the OS denied permission. */
  enabled: boolean;
  reason?: 'disabled' | 'no-permission';
  classReminders: number;
  planReminders: number;
  dailyReminders: number;
};

/**
 * iOS keeps at most 64 pending local notifications; going over silently drops
 * the extras. Staying well under keeps behaviour identical on both platforms.
 */
const MAX_SCHEDULED = 56;

/** Rebuilds the entire reminder schedule from current app state. */
export async function syncReminders(): Promise<SyncResult> {
  const empty = { classReminders: 0, planReminders: 0, dailyReminders: 0 };

  if (!useThemeStore.getState().notificationsEnabled) {
    await cancelAllScheduled();
    return { enabled: false, reason: 'disabled', ...empty };
  }
  if ((await getNotificationPermission()) !== 'granted') {
    await cancelAllScheduled();
    return { enabled: false, reason: 'no-permission', ...empty };
  }

  // Wipe our own reminders before rebuilding the schedule from scratch.
  await cancelByKind(['class', 'plan', 'daily']);

  const uid = useAuthStore.getState().fbUser?.uid ?? 'anon';
  const profile = useAuthStore.getState().profile;
  const { classes, plans } = usePlannerStore.getState();

  let budget = MAX_SCHEDULED;
  const result: SyncResult = { enabled: true, ...empty };

  /* 1. Daily "plan your day" nudge ---------------------------------------- */
  // Onboarding stores this under `preferences` (see profile-repository).
  const reminderTime = profile?.preferences?.reminderTime;
  if (typeof reminderTime === 'number' && budget > 0) {
    const t = clampMinutes(reminderTime);
    const id = await scheduleDaily(
      {
        title: 'Plan your day',
        body: 'Take a minute to review your schedule and set today’s priorities.',
        data: { kind: 'daily', icon: 'sunny-outline', colorKey: 'orange' },
      },
      Math.floor(t / 60),
      t % 60,
    );
    if (id) {
      result.dailyReminders += 1;
      budget -= 1;
    }
  }

  /* 2. Class reminders ---------------------------------------------------- */
  for (const cls of classes.filter((c) => c.uid === uid)) {
    if (budget <= 0) break;
    const offset = reminderOffsetMinutes(cls.reminder);
    if (offset === null) continue;
    const scheduled = await scheduleForClass(cls, offset, budget);
    result.classReminders += scheduled;
    budget -= scheduled;
  }

  /* 3. Daily-plan items (nearest first, so the budget goes to what's next) - */
  const upcoming = plans
    .filter((p): p is PlanItem => p.uid === uid && !p.done)
    .map((p) => ({ plan: p, when: dateAt(p.date, clampMinutes(p.time)) }))
    .filter((x): x is { plan: PlanItem; when: Date } => !!x.when && x.when.getTime() > Date.now())
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  for (const { plan, when } of upcoming) {
    if (budget <= 0) break;
    const id = await scheduleOnce(
      {
        title: plan.title,
        body: `Scheduled for ${formatTime(plan.time)}${plan.note ? ` · ${plan.note}` : ''}`,
        data: { kind: 'plan', refId: plan.id, icon: 'today-outline', colorKey: 'primary' },
      },
      when,
    );
    if (id) {
      result.planReminders += 1;
      budget -= 1;
    }
  }

  return result;
}

/** Schedules the reminder(s) for one class. Returns how many were created. */
async function scheduleForClass(cls: PlanClass, offset: number, budget: number): Promise<number> {
  const body =
    offset === 0
      ? `Starting now${cls.room ? ` · ${cls.room}` : ''}`
      : `Starts at ${formatTime(cls.start)}${cls.room ? ` · ${cls.room}` : ''}`;

  const payload = {
    title: cls.subject,
    body,
    data: { kind: 'class' as const, refId: cls.id, icon: 'book-outline', colorKey: 'blue' },
  };

  const repeat = cls.repeat ?? 'Weekly';

  // Daily repeat ignores the class's weekday entirely.
  if (repeat === 'Daily') {
    const { minutes } = shiftBack(cls.day, cls.start, offset);
    const id = await scheduleDaily(payload, Math.floor(minutes / 60), minutes % 60);
    return id ? 1 : 0;
  }

  // One-off: fire at the next matching weekday only.
  if (repeat === 'Never') {
    const { day, minutes } = shiftBack(cls.day, cls.start, offset);
    const id = await scheduleOnce(payload, nextOccurrence(day, minutes));
    return id ? 1 : 0;
  }

  const days = repeat === 'Weekdays' ? WEEKDAY_DAYS : [cls.day];
  let made = 0;
  for (const d of days) {
    if (made >= budget) break;
    const { day, minutes } = shiftBack(d, cls.start, offset);
    const id = await scheduleWeekly(
      payload,
      toExpoWeekday(day),
      Math.floor(minutes / 60),
      minutes % 60,
    );
    if (id) made += 1;
  }
  return made;
}

/* -------------------------------------------------------------------------- */
/* Debounced trigger                                                          */
/* -------------------------------------------------------------------------- */

let pending: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<SyncResult> | null = null;

/**
 * Fire-and-forget resync. Safe to call from every mutation — rapid-fire calls
 * collapse into a single rebuild.
 */
export function requestReminderSync(delayMs = 400): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    if (inFlight) {
      // A rebuild is already running; queue one more pass after it settles.
      inFlight.finally(() => requestReminderSync(0));
      return;
    }
    inFlight = syncReminders().finally(() => {
      inFlight = null;
    });
    void inFlight.catch(() => {});
  }, delayMs);
}
