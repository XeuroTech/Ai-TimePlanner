import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';

import {
  DeliveryPurpose,
  RestDelivery,
  sendPasswordResetViaRest,
  sendVerificationEmailViaRest,
} from '@/lib/auth/email-delivery';
import { getFirebaseAuth } from '@/lib/firebase/config';
import {
  authErrorCode,
  friendlyAuthError,
  isUnexpectedAuthError,
} from '@/lib/firebase/errors';
import { reportError, trackEvent } from '@/lib/services/observability';
import { normalizeEmail } from '@/lib/validation';

/**
 * Every call goes through `getFirebaseAuth()` rather than a module-scope `auth`
 * binding. Firebase must NOT be initialized while this module is being required
 * — it is pulled in by `app/_layout.tsx` during expo-router's route load, where
 * any throw is swallowed by Metro and resurfaces as
 * "Cannot read property 'ErrorBoundary' of undefined". See lib/firebase/config.ts.
 */
export type SessionUser = { uid: string; email: string | null; name: string | null; emailVerified: boolean };
export type AuthOutcome = { ok: true; user: SessionUser } | { ok: false; error: string };
export type SimpleOutcome = { ok: true } | { ok: false; error: string };

/**
 * Result of asking Firebase to send an email.
 *
 * `cooldownSeconds` lets the UI disable its resend control for as long as the
 * throttle lasts instead of letting the user tap into
 * `auth/too-many-requests`; `retryInSeconds` is the remaining wait when a call
 * was refused locally *because* of that throttle.
 */
export type EmailActionOutcome =
  | { ok: true; cooldownSeconds: number }
  | { ok: false; error: string; code?: string; retryInSeconds?: number };

/**
 * Registration reports the verification email separately from the account:
 * the account can exist while the email failed to send, and the UI must be
 * able to say so instead of claiming "check your inbox".
 */
export type RegisterOutcome =
  | { ok: true; user: SessionUser; verificationSent: boolean; verificationError?: string }
  | { ok: false; error: string };

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Firebase throttles repeated verification / reset emails per account and per
 * device, and answers a burst with `auth/too-many-requests` — which locks the
 * user out of the retry they actually needed. Holding our own cooldown keeps
 * every tap that reaches Firebase a useful one.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

const lastSentAt = new Map<string, number>();

function cooldownKey(purpose: DeliveryPurpose, email: string | null | undefined): string {
  return `${purpose}:${(email ?? 'unknown').toLowerCase()}`;
}

/** Seconds left before another send is allowed (0 when it is allowed now). */
function remainingCooldown(purpose: DeliveryPurpose, email: string | null | undefined): number {
  const previous = lastSentAt.get(cooldownKey(purpose, email));
  if (!previous) return 0;
  const elapsed = (Date.now() - previous) / 1000;
  return elapsed >= RESEND_COOLDOWN_SECONDS ? 0 : Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
}

function markSent(purpose: DeliveryPurpose, email: string | null | undefined): void {
  lastSentAt.set(cooldownKey(purpose, email), Date.now());
}

/** Clears the throttle for an address — used after a fresh sign-up. */
function clearCooldown(purpose: DeliveryPurpose, email: string | null | undefined): void {
  lastSentAt.delete(cooldownKey(purpose, email));
}

/**
 * Crashlytics is a native module, so `reportError` is a silent no-op in Expo Go
 * and on web. Anything we need to actually *see* while debugging also goes to
 * the Metro console, with the raw Firebase error code intact.
 */
function devLog(context: string, error: unknown): void {
  if (!isDev) return;
  const code = authErrorCode(error) ?? 'no-code';
  const message = (error as { message?: string })?.message ?? String(error);
  console.warn(`[auth] ${context} failed — code=${code} message=${message}`);
}

/** One line per email attempt, in every build profile — these are the ones that go wrong silently. */
function logDelivery(context: string, detail: Record<string, unknown>): void {
  console.log(`[auth][email] ${context}`, detail);
}

const toSession = (u: User): SessionUser => ({
  uid: u.uid,
  email: u.email,
  name: u.displayName,
  emailVerified: u.emailVerified,
});

function handle(error: unknown, context: string): { ok: false; error: string } {
  if (isUnexpectedAuthError(error)) reportError(error, context);
  devLog(context, error);
  return { ok: false, error: friendlyAuthError(error) };
}

/** Codes where the SDK already knows better than any REST retry can. */
const CONNECTIVITY_CODES = new Set(['auth/network-request-failed', 'auth/timeout']);

/**
 * Pick the message to show when both the SDK and the REST retry failed.
 *
 * The REST reason usually wins: it is derived from the server's own
 * explanation, whereas the SDK code is frequently the useless
 * `auth/internal-error`.
 *
 * The exception is a connectivity failure. The REST retry has to refresh an ID
 * token first, and with no network that step fails on its own — which would
 * report "your session expired" to someone whose only problem is being offline.
 */
function describeFailure(sdkError: unknown, rest: RestDelivery | null): string {
  const code = authErrorCode(sdkError);
  if (code && CONNECTIVITY_CODES.has(code)) return friendlyAuthError(sdkError);
  if (rest && !rest.ok) return rest.reason;
  return friendlyAuthError(sdkError);
}

// ---------------------------------------------------------------------------
// Email delivery
// ---------------------------------------------------------------------------

/**
 * Send the verification email for `user`, falling back to the REST endpoint
 * when the SDK call fails.
 *
 * Analytics is deliberately kept OUT of the try/catch around the send: a throw
 * from the native Analytics module in Expo Go used to land in the same catch
 * block and report a perfectly delivered email as failed. `trackEvent` is now
 * throw-proof on its own (see lib/services/observability.ts), and it is also
 * called after the outcome is decided so it cannot influence it.
 */
async function deliverVerificationEmail(user: User, context: string): Promise<EmailActionOutcome> {
  let sdkError: unknown = null;
  try {
    await sendEmailVerification(user);
    markSent('VERIFY_EMAIL', user.email);
    logDelivery(`${context}:sent`, { via: 'sdk', email: user.email, uid: user.uid });
    trackEvent('verification_email_sent', { via: 'sdk' });
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  } catch (e) {
    sdkError = e;
    devLog(context, e);
  }

  // Second attempt straight at the REST endpoint. Worth doing even when the
  // SDK code looks fatal, because that is exactly the case where the SDK code
  // is least trustworthy — and this is the call that returns a real reason.
  const rest = await sendVerificationEmailViaRest(user);
  if (rest.ok) {
    markSent('VERIFY_EMAIL', user.email);
    logDelivery(`${context}:sent`, {
      via: 'rest-fallback',
      email: user.email,
      sdkCode: authErrorCode(sdkError) ?? 'no-code',
    });
    trackEvent('verification_email_sent', { via: 'rest' });
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  }

  logDelivery(`${context}:failed`, {
    email: user.email,
    uid: user.uid,
    sdkCode: authErrorCode(sdkError) ?? 'no-code',
    sdkMessage: (sdkError as { message?: string })?.message,
    httpStatus: rest.status,
    serverCode: rest.serverCode,
    serverMessage: rest.serverMessage,
  });
  reportError(sdkError ?? new Error(rest.serverMessage ?? 'verification email failed'), context);
  return {
    ok: false,
    error: describeFailure(sdkError, rest),
    code: authErrorCode(sdkError) ?? rest.serverCode ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register with email + password, then send a verification email. */
export async function register(email: string, password: string): Promise<RegisterOutcome> {
  const address = normalizeEmail(email);
  let user: User;
  try {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), address, password);
    user = cred.user;
  } catch (e) {
    return handle(e, 'register');
  }

  // The account exists from here on: never return `ok: false` below, or the UI
  // will invite the user to sign up again with an address that is now taken.
  trackEvent('sign_up', { method: 'password' });

  // A brand-new address has no meaningful send history, and the sign-up mail
  // must not be swallowed by a cooldown left over from an earlier attempt.
  clearCooldown('VERIFY_EMAIL', address);

  const sent = await deliverVerificationEmail(user, 'register/sendEmailVerification');
  if (sent.ok) return { ok: true, user: toSession(user), verificationSent: true };
  return {
    ok: true,
    user: toSession(user),
    verificationSent: false,
    verificationError: sent.error,
  };
}

export async function login(email: string, password: string): Promise<AuthOutcome> {
  try {
    const cred = await signInWithEmailAndPassword(getFirebaseAuth(), normalizeEmail(email), password);
    trackEvent('login', { method: 'password' });
    return { ok: true, user: toSession(cred.user) };
  } catch (e) {
    return handle(e, 'login');
  }
}

/** Sign in with a Google ID token obtained via expo-auth-session. */
export async function signInWithGoogle(idToken: string): Promise<AuthOutcome> {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const cred = await signInWithCredential(getFirebaseAuth(), credential);
    trackEvent('login_google');
    return { ok: true, user: toSession(cred.user) };
  } catch (e) {
    return handle(e, 'google');
  }
}

/** Sign in with an Apple identity token + raw nonce (expo-apple-authentication). */
export async function signInWithApple(idToken: string, rawNonce: string, fullName?: string): Promise<AuthOutcome> {
  try {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    const cred = await signInWithCredential(getFirebaseAuth(), credential);
    trackEvent('login_apple');
    const user = toSession(cred.user);
    // Apple only returns the name on first sign-in; prefer it when present.
    if (fullName && !user.name) user.name = fullName;
    return { ok: true, user };
  } catch (e) {
    return handle(e, 'apple');
  }
}

/**
 * Resend the verification email to the currently signed-in user.
 *
 * `reload()` runs first so an address verified in another tab/device short-
 * circuits into success instead of sending a second, pointless email — and so
 * a revoked session surfaces as "log in again" rather than as an opaque send
 * failure.
 */
export async function sendVerificationEmail(): Promise<EmailActionOutcome> {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;

  if (!current) {
    return { ok: false, error: 'You are not signed in. Please log in again.', code: 'auth/null-user' };
  }

  const wait = remainingCooldown('VERIFY_EMAIL', current.email);
  if (wait > 0) {
    return {
      ok: false,
      error: `Please wait ${wait}s before requesting another email.`,
      code: 'app/cooldown',
      retryInSeconds: wait,
    };
  }

  try {
    await reload(current);
  } catch (e) {
    // A failed reload is informative but not fatal — the send below will
    // produce the real verdict.
    devLog('sendVerificationEmail/reload', e);
  }

  if (current.emailVerified) {
    return { ok: true, cooldownSeconds: 0 };
  }

  return deliverVerificationEmail(current, 'sendVerificationEmail');
}

/** Re-fetches the current user so a just-clicked verification link is reflected. */
export async function refreshEmailVerified(): Promise<boolean> {
  const current = getFirebaseAuth().currentUser;
  if (!current) return false;
  try {
    await reload(current);
  } catch (e) {
    devLog('refreshEmailVerified', e);
    reportError(e, 'refreshEmailVerified');
  }
  return current.emailVerified;
}

/**
 * Send the password-reset email.
 *
 * Note on the success case: when "Email enumeration protection" is enabled
 * (the default for new Firebase projects) the backend answers 200 for an
 * address that has no account and sends nothing at all. `ok: true` therefore
 * means "Firebase accepted the request", not "an email is on its way", and the
 * UI wording has to match.
 */
export async function forgotPassword(email: string): Promise<EmailActionOutcome> {
  const address = normalizeEmail(email);
  const auth = getFirebaseAuth();

  const wait = remainingCooldown('PASSWORD_RESET', address);
  if (wait > 0) {
    return {
      ok: false,
      error: `Please wait ${wait}s before requesting another email.`,
      code: 'app/cooldown',
      retryInSeconds: wait,
    };
  }

  let sdkError: unknown = null;
  try {
    await sendPasswordResetEmail(auth, address);
    markSent('PASSWORD_RESET', address);
    logDelivery('forgotPassword:sent', { via: 'sdk', email: address });
    trackEvent('password_reset_requested', { via: 'sdk' });
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  } catch (e) {
    sdkError = e;
    devLog('forgotPassword', e);
  }

  const rest = await sendPasswordResetViaRest(address);
  if (rest.ok) {
    markSent('PASSWORD_RESET', address);
    logDelivery('forgotPassword:sent', {
      via: 'rest-fallback',
      email: address,
      sdkCode: authErrorCode(sdkError) ?? 'no-code',
    });
    trackEvent('password_reset_requested', { via: 'rest' });
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  }

  logDelivery('forgotPassword:failed', {
    email: address,
    sdkCode: authErrorCode(sdkError) ?? 'no-code',
    sdkMessage: (sdkError as { message?: string })?.message,
    httpStatus: rest.status,
    serverCode: rest.serverCode,
    serverMessage: rest.serverMessage,
  });
  reportError(sdkError ?? new Error(rest.serverMessage ?? 'password reset email failed'), 'forgotPassword');
  return {
    ok: false,
    error: describeFailure(sdkError, rest),
    code: authErrorCode(sdkError) ?? rest.serverCode ?? undefined,
  };
}

export async function logout(): Promise<SimpleOutcome> {
  try {
    await signOut(getFirebaseAuth());
    trackEvent('logout');
    return { ok: true };
  } catch (e) {
    return handle(e, 'logout');
  }
}

export async function deleteAccount(): Promise<SimpleOutcome> {
  try {
    const current = getFirebaseAuth().currentUser;
    if (!current) return { ok: false, error: 'You are not signed in.' };
    await deleteUser(current);
    trackEvent('account_deleted');
    return { ok: true };
  } catch (e) {
    return handle(e, 'deleteAccount');
  }
}

/** Session restore: fires immediately with the persisted user (or null). */
export function subscribe(callback: (user: SessionUser | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (u) => callback(u ? toSession(u) : null));
}
