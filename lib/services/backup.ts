/**
 * Backup payload: turning the whole app into one JSON document and back.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS IN A BACKUP
 * ---------------------------------------------------------------------------
 * Everything the user typed, from both storage engines:
 *
 *   - SQLite  → profile (name, category, preferences, premium flag), AI chats
 *   - Zustand/AsyncStorage → timetable classes, tasks, daily plans, habits +
 *     the per-day habit log, notification inbox, theme/notification switches
 *
 * Deliberately NOT in a backup: the Google OAuth tokens (`@aip/googleDriveTokens`)
 * and the Firebase session. Restoring a *credential* onto another device would
 * be a security hole, and the user signs in there anyway.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY ROW IS RE-STAMPED WITH THE CURRENT uid ON RESTORE
 * ---------------------------------------------------------------------------
 * Planner/habit/notification rows carry a `uid` and every selector filters on
 * `uid === current user`. A backup made under account A and restored under
 * account B would therefore restore rows that are invisible in the UI —
 * technically present, practically lost. `remapUid` rewrites them to whoever is
 * signed in now, so a restore always *shows up*.
 *
 * Restore is scoped, not global: rows belonging to OTHER uids on this device are
 * left untouched, so restoring on a shared phone can't wipe a sibling's data.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { CategoryId } from '@/constants/categories';
import * as chatRepo from '@/lib/db/chat-repository';
import * as profileRepo from '@/lib/db/profile-repository';
import { Preferences } from '@/lib/db/profile-repository';
import { Habit, HabitLog, useHabitsStore } from '@/store/habits-store';
import { InboxItem, useNotificationStore } from '@/store/notification-store';
import { PlanClass, PlanItem, PlanTask, usePlannerStore } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';

/* -------------------------------------------------------------------------- */
/* Format                                                                     */
/* -------------------------------------------------------------------------- */

/** Magic string so a wrong file picked from Drive is rejected, not half-applied. */
export const BACKUP_FORMAT = 'smart-planner-backup';

/** Bump when the shape changes, and add a branch to `migrate()` below. */
export const BACKUP_VERSION = 1;

export type BackupProfile = {
  name: string;
  category?: CategoryId;
  onboarded: boolean;
  preferences: Preferences;
};

export type BackupChat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    role: chatRepo.ChatMessageRole;
    text: string;
    plan?: chatRepo.ChatPlanItem[];
    createdAt: string;
  }[];
};

export type BackupData = {
  profile: BackupProfile | null;
  planner: { classes: PlanClass[]; tasks: PlanTask[]; plans: PlanItem[] };
  habits: { habits: Habit[]; log: HabitLog };
  notifications: InboxItem[];
  settings: { darkMode: boolean; notificationsEnabled: boolean };
  chats: BackupChat[];
};

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO timestamp of when the snapshot was taken. */
  createdAt: string;
  /** Which account produced it — shown on the restore confirmation. */
  uid: string;
  /** Free-text label ("Android · Smart Planner 1.0.0") for the UI only. */
  device: string;
  appVersion: string;
  data: BackupData;
};

/** Row counts for the "what am I about to restore" summary. */
export type BackupSummary = {
  createdAt: string;
  device: string;
  classes: number;
  tasks: number;
  plans: number;
  habits: number;
  notifications: number;
  chats: number;
  /** True when the backup was made by a different account than the current one. */
  foreign: boolean;
};

/* -------------------------------------------------------------------------- */
/* Rehydration guard                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Zustand's `persist` middleware reads AsyncStorage **asynchronously**, so for a
 * moment after launch every store still holds its empty initial state.
 *
 * Backing up during that window would upload an empty snapshot over a perfectly
 * good one — silent data loss, and the auto-sync path can fire without anyone
 * watching. Restoring during it is just as bad: the late rehydration would
 * clobber whatever we just wrote. Both paths therefore wait here first.
 */
type PersistedStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
  };
};

/** Give up waiting after this long and proceed — better than hanging forever. */
const HYDRATION_TIMEOUT_MS = 8_000;

function whenHydrated(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

/** Resolves once every persisted store has finished reading from AsyncStorage. */
export async function waitForLocalData(): Promise<void> {
  const stores: PersistedStore[] = [
    usePlannerStore,
    useHabitsStore,
    useNotificationStore,
    useThemeStore,
  ];
  await Promise.race([
    Promise.all(stores.map(whenHydrated)),
    new Promise((resolve) => setTimeout(resolve, HYDRATION_TIMEOUT_MS)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

function deviceLabel(): string {
  const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
  return `${os} · ${Constants.expoConfig?.name ?? 'Smart Planner'}`;
}

function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/** Everything belonging to `uid`, ready to be JSON-stringified. */
export async function buildBackup(uid: string): Promise<Backup> {
  await waitForLocalData();

  const planner = usePlannerStore.getState();
  const habitsState = useHabitsStore.getState();
  const notifications = useNotificationStore.getState().items.filter((i) => i.uid === uid);
  const theme = useThemeStore.getState();

  const habits = habitsState.habits.filter((h) => h.uid === uid);
  // Only carry log entries for habits we're actually backing up, otherwise the
  // log keeps growing with keys nobody can resolve.
  const log: HabitLog = {};
  for (const habit of habits) {
    const entries = habitsState.log[habit.id];
    if (entries) log[habit.id] = entries;
  }

  const [profile, chats] = await Promise.all([profileRepo.getProfile(uid), exportChats(uid)]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    uid,
    device: deviceLabel(),
    appVersion: appVersion(),
    data: {
      profile: profile
        ? {
            name: profile.name,
            ...(profile.category ? { category: profile.category } : {}),
            onboarded: profile.onboarded,
            preferences: profile.preferences,
          }
        : null,
      planner: {
        classes: planner.classes.filter((c) => c.uid === uid),
        tasks: planner.tasks.filter((t) => t.uid === uid),
        plans: planner.plans.filter((p) => p.uid === uid),
      },
      habits: { habits, log },
      notifications,
      settings: { darkMode: theme.darkMode, notificationsEnabled: theme.notificationsEnabled },
      chats,
    },
  };
}

/** Pretty-printed so a curious user opening the Drive file can read it. */
export async function serializeBackup(uid: string): Promise<{ json: string; backup: Backup }> {
  const backup = await buildBackup(uid);
  return { json: JSON.stringify(backup, null, 2), backup };
}

/* -------------------------------------------------------------------------- */
/* Parse                                                                      */
/* -------------------------------------------------------------------------- */

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

/** Anything missing in an older/hand-edited file is filled in, never assumed. */
function normalizeData(raw: Partial<BackupData> | undefined): BackupData {
  const planner = raw?.planner;
  const habits = raw?.habits;
  return {
    profile: raw?.profile ?? null,
    planner: {
      classes: Array.isArray(planner?.classes) ? planner.classes : [],
      tasks: Array.isArray(planner?.tasks) ? planner.tasks : [],
      plans: Array.isArray(planner?.plans) ? planner.plans : [],
    },
    habits: {
      habits: Array.isArray(habits?.habits) ? habits.habits : [],
      log: habits?.log && typeof habits.log === 'object' ? habits.log : {},
    },
    notifications: Array.isArray(raw?.notifications) ? raw.notifications : [],
    settings: {
      darkMode: !!raw?.settings?.darkMode,
      notificationsEnabled: raw?.settings?.notificationsEnabled ?? true,
    },
    chats: Array.isArray(raw?.chats) ? raw.chats : [],
  };
}

/**
 * Validates and normalises a downloaded backup.
 *
 * Throws `BackupFormatError` rather than returning null so the caller can put
 * the reason in front of the user instead of a generic "restore failed".
 */
export function parseBackup(json: string): Backup {
  let raw: Partial<Backup>;
  try {
    raw = JSON.parse(json) as Partial<Backup>;
  } catch {
    throw new BackupFormatError('The cloud backup file is corrupted and cannot be read.');
  }
  if (!raw || raw.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('That file is not a Smart Planner backup.');
  }
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > BACKUP_VERSION) {
    throw new BackupFormatError(
      'This backup was made by a newer version of the app. Please update Smart Planner and try again.',
    );
  }
  return {
    format: BACKUP_FORMAT,
    version,
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    uid: raw.uid ?? '',
    device: raw.device ?? 'Unknown device',
    appVersion: raw.appVersion ?? '',
    data: normalizeData(raw.data),
  };
}

export function summarize(backup: Backup, currentUid: string): BackupSummary {
  return {
    createdAt: backup.createdAt,
    device: backup.device,
    classes: backup.data.planner.classes.length,
    tasks: backup.data.planner.tasks.length,
    plans: backup.data.planner.plans.length,
    habits: backup.data.habits.habits.length,
    notifications: backup.data.notifications.length,
    chats: backup.data.chats.length,
    foreign: !!backup.uid && backup.uid !== currentUid,
  };
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                    */
/* -------------------------------------------------------------------------- */

function remapUid<T extends { uid: string }>(rows: T[], uid: string): T[] {
  return rows.map((row) => ({ ...row, uid }));
}

/**
 * Overwrites this device's data for `uid` with the backup's contents.
 *
 * Zustand `setState` is used directly instead of adding a `replaceAll` action to
 * each store: the `persist` middleware writes to AsyncStorage on any state
 * change, so this is both persisted and reactive, and no store's public API has
 * to grow a method that only the restore path would ever call.
 */
export async function applyBackup(backup: Backup, uid: string): Promise<void> {
  await waitForLocalData();
  const { data } = backup;

  // --- planner ------------------------------------------------------------
  usePlannerStore.setState((s) => ({
    classes: [...s.classes.filter((c) => c.uid !== uid), ...remapUid(data.planner.classes, uid)],
    tasks: [...s.tasks.filter((t) => t.uid !== uid), ...remapUid(data.planner.tasks, uid)],
    plans: [...s.plans.filter((p) => p.uid !== uid), ...remapUid(data.planner.plans, uid)],
  }));

  // --- habits -------------------------------------------------------------
  useHabitsStore.setState((s) => {
    const mine = new Set(s.habits.filter((h) => h.uid === uid).map((h) => h.id));
    // Drop only the current user's log entries; keep other accounts' history.
    const log: HabitLog = Object.fromEntries(
      Object.entries(s.log).filter(([habitId]) => !mine.has(habitId)),
    );
    return {
      habits: [...s.habits.filter((h) => h.uid !== uid), ...remapUid(data.habits.habits, uid)],
      log: { ...log, ...data.habits.log },
    };
  });

  // --- notification inbox -------------------------------------------------
  useNotificationStore.setState((s) => ({
    items: [...s.items.filter((i) => i.uid !== uid), ...remapUid(data.notifications, uid)].sort(
      (a, b) => b.at - a.at,
    ),
  }));

  // --- app switches -------------------------------------------------------
  useThemeStore.setState({
    darkMode: data.settings.darkMode,
    notificationsEnabled: data.settings.notificationsEnabled,
  });

  // --- SQLite -------------------------------------------------------------
  if (data.profile) {
    await profileRepo.ensureProfile(uid, data.profile.name);
    await profileRepo.updateProfile(uid, {
      name: data.profile.name,
      ...(data.profile.category ? { category: data.profile.category } : {}),
      onboarded: data.profile.onboarded,
      preferences: data.profile.preferences,
    });
  }
  await importChats(uid, data.chats);
}

/* -------------------------------------------------------------------------- */
/* Chat history (SQLite)                                                      */
/* -------------------------------------------------------------------------- */

async function exportChats(uid: string): Promise<BackupChat[]> {
  const conversations = await chatRepo.listConversations(uid);
  const out: BackupChat[] = [];
  for (const conversation of conversations) {
    const messages = await chatRepo.getMessages(conversation.id);
    out.push({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        ...(m.plan ? { plan: m.plan } : {}),
        createdAt: m.createdAt,
      })),
    });
  }
  return out;
}

async function importChats(uid: string, chats: BackupChat[]): Promise<void> {
  // Replace rather than merge: ids are preserved in the backup, so merging would
  // hit primary-key conflicts on every re-restore.
  await chatRepo.deleteAllConversations(uid);
  for (const chat of chats) {
    await chatRepo.insertConversation({
      id: chat.id,
      uid,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages,
    });
  }
}
