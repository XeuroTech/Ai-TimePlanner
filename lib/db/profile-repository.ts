import { CategoryId } from '@/constants/categories';
import { getDb } from '@/lib/db/database';

export type Preferences = {
  country?: string;
  timezone?: string;
  workingDays?: string[];
  wakeTime?: number;
  sleepTime?: number;
  workingHours?: number;
  reminderTime?: number;
  aiGoals?: string;

  /* Daily routine (app/daily-routine.tsx). These used to be local component
   * state and were lost on every close; they are persisted here so the screen
   * reopens with real values and the AI planner can read them. */
  studyHours?: number;
  workHours?: number;
  /** Minutes of exercise per day. */
  exerciseMinutes?: number;
  mealsPerDay?: number;

  /** Subscription tier. Absent === 'free'. See hooks/use-premium.ts. */
  plan?: 'free' | 'premium';
  /** Billing cycle chosen on the premium screen. */
  planCycle?: 'monthly' | 'yearly';
  /** ISO timestamp of when premium was activated. */
  planSince?: string;

  /** file:// URI of the profile picture, copied into the app's document directory. */
  avatarUri?: string;

  /** ISO 639-1 code (e.g. `en`, `ur`) of the user's preferred language. */
  language?: string;

  /** User-defined extras on the Daily Routine screen, in the order they were added. */
  customRoutine?: RoutineItem[];
  /** Built-in Daily Routine cards the user removed (everything except wake/sleep is removable). */
  hiddenRoutineDefaults?: DefaultRoutineKey[];
};

export type DefaultRoutineKey = 'study' | 'work' | 'exercise' | 'meals';

/** A user-added Daily Routine entry (app/daily-routine.tsx) — everyone's routine differs. */
export type RoutineItem = {
  id: string;
  label: string;
  /** Ionicon name. Loosely typed here since this data-layer file has no RN/vector-icons import. */
  icon: string;
  colorKey: 'primary' | 'blue' | 'green' | 'orange' | 'pink';
  minutes: number;
  createdAt: number;
};

export type LocalProfile = {
  uid: string;
  name: string;
  category?: CategoryId;
  onboarded: boolean;
  preferences: Preferences;
  createdAt: string;
  updatedAt: string;
};

type ProfileRow = {
  uid: string;
  name: string;
  category: string | null;
  onboarded: number;
  preferences: string;
  created_at: string;
  updated_at: string;
};

function rowToProfile(row: ProfileRow): LocalProfile {
  let preferences: Preferences = {};
  try {
    preferences = row.preferences ? (JSON.parse(row.preferences) as Preferences) : {};
  } catch {
    preferences = {};
  }
  return {
    uid: row.uid,
    name: row.name,
    category: (row.category as CategoryId) ?? undefined,
    onboarded: row.onboarded === 1,
    preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(uid: string): Promise<LocalProfile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE uid = ?', uid);
  return row ? rowToProfile(row) : null;
}

/** Creates the profile if it doesn't exist, then returns it. */
export async function ensureProfile(uid: string, name: string): Promise<LocalProfile> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO profiles (uid, name, category, onboarded, preferences, created_at, updated_at)
     VALUES (?, ?, NULL, 0, '{}', ?, ?)`,
    uid,
    name || 'User',
    now,
    now,
  );
  const profile = await getProfile(uid);
  // getProfile can't be null right after insert, but keep TS happy.
  return profile ?? {
    uid,
    name: name || 'User',
    onboarded: false,
    preferences: {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateProfile(
  uid: string,
  patch: { name?: string; category?: CategoryId; onboarded?: boolean; preferences?: Preferences },
): Promise<LocalProfile | null> {
  const existing = await getProfile(uid);
  if (!existing) return null;
  const merged: LocalProfile = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {}),
    preferences: { ...existing.preferences, ...(patch.preferences ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  const db = await getDb();
  await db.runAsync(
    `UPDATE profiles SET name = ?, category = ?, onboarded = ?, preferences = ?, updated_at = ? WHERE uid = ?`,
    merged.name,
    merged.category ?? null,
    merged.onboarded ? 1 : 0,
    JSON.stringify(merged.preferences),
    merged.updatedAt,
    uid,
  );
  return merged;
}

export async function deleteProfile(uid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM profiles WHERE uid = ?', uid);
}
