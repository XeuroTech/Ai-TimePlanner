import { CategoryId } from '@/constants/categories';
import { readJSON, writeJSON } from '@/lib/storage';

/**
 * Client-side auth backed by AsyncStorage. Fully functional locally so the
 * app works end-to-end today. Replace this single module with real API calls
 * (fetch/axios) when the backend is ready — the store + screens stay the same.
 *
 * Note: this demo stores credentials locally in plain text. Do NOT ship as-is;
 * the production backend must hash passwords and issue real tokens.
 */

const USERS_KEY = '@aip/users';
const CODES_KEY = '@aip/reset-codes';

export type UserProfile = {
  name: string;
  email: string;
  category?: CategoryId;
  country?: string;
  timezone?: string;
  workingDays?: string[];
  wakeTime?: number; // minutes from midnight
  sleepTime?: number;
  workingHours?: number;
  reminderTime?: number;
  aiGoals?: string;
};

export type AuthUser = UserProfile & {
  id: string;
  verified: boolean;
  onboarded: boolean;
};

type StoredUser = AuthUser & { password: string };

export type AuthResult = { ok: true; user: AuthUser; token: string } | { ok: false; error: string };

const delay = (ms = 700) => new Promise((res) => setTimeout(res, ms));
const makeId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const makeToken = () => makeId() + makeId();
const strip = (u: StoredUser): AuthUser => {
  const { password, ...rest } = u;
  void password;
  return rest;
};

async function getUsers(): Promise<StoredUser[]> {
  return readJSON<StoredUser[]>(USERS_KEY, []);
}
async function saveUsers(users: StoredUser[]): Promise<void> {
  await writeJSON(USERS_KEY, users);
}

export async function register(input: { name: string; email: string; password: string }): Promise<AuthResult> {
  await delay();
  const email = input.email.trim().toLowerCase();
  const users = await getUsers();
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: 'An account with this email already exists.' };
  }
  const user: StoredUser = {
    id: makeId(),
    name: input.name.trim(),
    email,
    password: input.password,
    verified: false,
    onboarded: false,
  };
  await saveUsers([...users, user]);
  return { ok: true, user: strip(user), token: makeToken() };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  await delay();
  const users = await getUsers();
  const found = users.find((u) => u.email === email.trim().toLowerCase());
  if (!found || found.password !== password) {
    return { ok: false, error: 'Incorrect email or password.' };
  }
  return { ok: true, user: strip(found), token: makeToken() };
}

export async function requestReset(email: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  await delay();
  const users = await getUsers();
  if (!users.some((u) => u.email === email.trim().toLowerCase())) {
    return { ok: false, error: 'No account found for this email.' };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codes = await readJSON<Record<string, string>>(CODES_KEY, {});
  codes[email.trim().toLowerCase()] = code;
  await writeJSON(CODES_KEY, codes);
  // In production the code is emailed. Returned here so the demo flow is usable.
  return { ok: true, code };
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  await delay();
  const key = email.trim().toLowerCase();
  const codes = await readJSON<Record<string, string>>(CODES_KEY, {});
  if (codes[key] !== code) return { ok: false, error: 'Invalid or expired code.' };
  const users = await getUsers();
  const idx = users.findIndex((u) => u.email === key);
  if (idx === -1) return { ok: false, error: 'No account found.' };
  users[idx].password = newPassword;
  await saveUsers(users);
  delete codes[key];
  await writeJSON(CODES_KEY, codes);
  return { ok: true };
}

export async function verifyEmail(email: string): Promise<{ ok: boolean }> {
  await delay(500);
  const users = await getUsers();
  const idx = users.findIndex((u) => u.email === email.trim().toLowerCase());
  if (idx !== -1) {
    users[idx].verified = true;
    await saveUsers(users);
  }
  return { ok: true };
}

export async function updateUser(email: string, patch: Partial<AuthUser>): Promise<AuthUser | null> {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.email === email.trim().toLowerCase());
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...patch };
  await saveUsers(users);
  return strip(users[idx]);
}
