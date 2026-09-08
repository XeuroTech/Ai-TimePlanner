import { create } from 'zustand';

import { CategoryId } from '@/constants/categories';
import * as authService from '@/lib/auth/auth-service';
import { EmailActionOutcome, SessionUser, SimpleOutcome } from '@/lib/auth/auth-service';
import * as chatRepo from '@/lib/db/chat-repository';
import { initDatabase } from '@/lib/db/database';
import * as profileRepo from '@/lib/db/profile-repository';
import { LocalProfile, Preferences } from '@/lib/db/profile-repository';
import { reportError } from '@/lib/services/observability';
import { readJSON, writeJSON } from '@/lib/storage';

const REMEMBER_KEY = '@aip/rememberMe';

type ActionResult = {
  ok: boolean;
  error?: string;
  onboarded?: boolean;
  emailVerified?: boolean;
  /** Registration only: false when the account was created but the verification email did not send. */
  verificationSent?: boolean;
  verificationError?: string;
};

type OnboardingFields = {
  name?: string;
} & Preferences;

type AuthState = {
  fbUser: SessionUser | null;
  profile: LocalProfile | null;
  rememberMe: boolean;
  status: 'idle' | 'loading';
  hydrated: boolean;

  init: () => Promise<void>;
  setRememberMe: (value: boolean) => void;
  register: (input: { name: string; email: string; password: string }) => Promise<ActionResult>;
  login: (email: string, password: string, rememberMe: boolean) => Promise<ActionResult>;
  afterSignIn: (user: SessionUser) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<EmailActionOutcome>;
  sendVerificationEmail: () => Promise<EmailActionOutcome>;
  refreshEmailVerified: () => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<SimpleOutcome>;
  updateProfile: (patch: { name?: string; category?: CategoryId; preferences?: Preferences }) => Promise<void>;
  completeOnboarding: (fields: OnboardingFields) => Promise<void>;
};

// Name captured at register time so the auth listener can create the local
// profile with the correct name (kept out of Firebase entirely).
let pendingName: string | null = null;
let started = false;
let firstAuthCallback = true;

type SetState = (partial: Partial<AuthState>) => void;
type GetState = () => AuthState;

/**
 * The real startup work, extracted so `init` can wrap it in a single
 * try/catch. Reaches Firebase for the first time via `authService.subscribe`
 * -> `getFirebaseAuth()`, which is exactly why it must be able to fail safely.
 */
async function runInit(set: SetState, get: GetState): Promise<void> {
  const rememberMe = await readJSON<boolean>(REMEMBER_KEY, true);
  set({ rememberMe });
  await initDatabase();

  authService.subscribe(async (session) => {
    try {
      // "Remember Me": on a cold-start restore with the flag off, sign out.
      if (firstAuthCallback && session && !get().rememberMe) {
        firstAuthCallback = false;
        await authService.logout();
        set({ fbUser: null, profile: null, hydrated: true });
        return;
      }
      firstAuthCallback = false;

      if (!session) {
        set({ fbUser: null, profile: null, hydrated: true, status: 'idle' });
        return;
      }
      const name = pendingName ?? session.name ?? 'User';
      pendingName = null;
      const profile = await profileRepo.ensureProfile(session.uid, name);
      set({ fbUser: session, profile, hydrated: true, status: 'idle' });
    } catch (e) {
      reportError(e, 'auth-store/onAuthStateChanged');
      set({ fbUser: null, profile: null, hydrated: true, status: 'idle' });
    }
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  fbUser: null,
  profile: null,
  rememberMe: true,
  status: 'idle',
  hydrated: false,

  init: async () => {
    if (started) return;
    started = true;
    // Never let a startup failure (missing Firebase config, SQLite error, ...)
    // leave `hydrated` false forever — the router gate would stall and the user
    // would sit on a blank screen. Report it and hydrate as signed-out instead.
    try {
      await runInit(set, get);
    } catch (e) {
      reportError(e, 'auth-store/init');
      set({ fbUser: null, profile: null, hydrated: true, status: 'idle' });
    }
  },

  setRememberMe: (value) => {
    set({ rememberMe: value });
    void writeJSON(REMEMBER_KEY, value);
  },

  register: async ({ name, email, password }) => {
    set({ status: 'loading' });
    pendingName = name.trim();
    const res = await authService.register(email, password);
    if (!res.ok) {
      pendingName = null;
      set({ status: 'idle' });
      return { ok: false, error: res.error };
    }
    get().setRememberMe(true);
    const onboarded = await get().afterSignIn(res.user);
    return {
      ok: true,
      onboarded,
      emailVerified: res.user.emailVerified,
      verificationSent: res.verificationSent,
      verificationError: res.verificationError,
    };
  },

  login: async (email, password, rememberMe) => {
    set({ status: 'loading' });
    get().setRememberMe(rememberMe);
    const res = await authService.login(email, password);
    if (!res.ok) {
      set({ status: 'idle' });
      return { ok: false, error: res.error };
    }
    const onboarded = await get().afterSignIn(res.user);
    return { ok: true, onboarded, emailVerified: res.user.emailVerified };
  },

  afterSignIn: async (user) => {
    const name = pendingName ?? user.name ?? 'User';
    pendingName = null;
    const profile = await profileRepo.ensureProfile(user.uid, name);
    set({ fbUser: user, profile, status: 'idle', hydrated: true });
    return profile.onboarded;
  },

  forgotPassword: (email) => authService.forgotPassword(email),

  sendVerificationEmail: () => authService.sendVerificationEmail(),

  refreshEmailVerified: async () => {
    const verified = await authService.refreshEmailVerified();
    const current = get().fbUser;
    if (current && current.emailVerified !== verified) {
      set({ fbUser: { ...current, emailVerified: verified } });
    }
    return verified;
  },

  logout: async () => {
    await authService.logout();
    set({ fbUser: null, profile: null });
  },

  deleteAccount: async () => {
    const uid = get().fbUser?.uid;
    const res = await authService.deleteAccount();
    if (res.ok && uid) {
      // Chat history is local-only, so it has to be purged alongside the profile.
      await chatRepo.deleteAllConversations(uid);
      await profileRepo.deleteProfile(uid);
    }
    if (res.ok) set({ fbUser: null, profile: null });
    return res;
  },

  updateProfile: async (patch) => {
    const uid = get().fbUser?.uid;
    if (!uid) return;
    const updated = await profileRepo.updateProfile(uid, patch);
    if (updated) set({ profile: updated });
  },

  completeOnboarding: async ({ name, ...preferences }) => {
    const uid = get().fbUser?.uid;
    if (!uid) return;
    const updated = await profileRepo.updateProfile(uid, {
      ...(name ? { name } : {}),
      onboarded: true,
      preferences,
    });
    if (updated) set({ profile: updated });
  },
}));

// Selectors
export const useIsAuthenticated = () => useAuthStore((s) => !!s.fbUser && !!s.profile);
export const useIsOnboarded = () => useAuthStore((s) => !!s.profile?.onboarded);
export const useIsEmailVerified = () => useAuthStore((s) => !!s.fbUser?.emailVerified);
export const useProfile = () => useAuthStore((s) => s.profile);
