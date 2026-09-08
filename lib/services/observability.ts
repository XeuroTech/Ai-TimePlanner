/**
 * Analytics + Crashlytics abstraction.
 *
 * Both are provided by NATIVE modules (`@react-native-firebase/analytics` and
 * `@react-native-firebase/crashlytics`, iOS/Android only). Neither is
 * available on web or in Expo Go, so both are lazily required behind a
 * platform guard and every helper degrades to a no-op (dev console only)
 * when the native module can't be loaded. This keeps web, Expo Go and the
 * JS-only test environments working unchanged.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY NATIVE CALL IS WRAPPED IN `safe()`
 * ---------------------------------------------------------------------------
 * In Expo Go the JS half of `@react-native-firebase/*` is present in
 * node_modules, so `require()` SUCCEEDS. The failure happens later, when the
 * default export is *invoked* (`analytics()` / `crashlytics()`): the module
 * looks for its native counterpart, doesn't find it, and THROWS
 * synchronously ("You attempted to use a firebase module that's not installed
 * natively...").
 *
 * A `require`-time try/catch therefore does not protect callers. Since
 * `trackEvent()` / `reportError()` are called from inside the auth flows —
 * some of them inside the same try/catch that decides whether a verification
 * email was sent — an analytics throw was able to masquerade as a failed
 * email. Instrumentation must never be able to change the outcome of the
 * operation it is instrumenting, so every native call now goes through
 * `safe()`, and a module that throws once is disabled for the rest of the
 * session.
 * ---------------------------------------------------------------------------
 */
import { Platform } from 'react-native';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/** Minimal surface of the Analytics instance we rely on. */
type AnalyticsInstance = {
  logEvent: (name: string, params?: Record<string, unknown>) => Promise<void>;
  logScreenView: (params: { screen_name: string; screen_class?: string }) => Promise<void>;
  setUserId: (userId: string | null) => Promise<void>;
  setUserProperty: (name: string, value: string | null) => Promise<void>;
  setAnalyticsCollectionEnabled: (enabled: boolean) => Promise<void>;
};

/** Minimal surface of the Crashlytics instance we rely on. */
type CrashlyticsInstance = {
  recordError: (error: Error, jsErrorName?: string) => void;
  log: (message: string) => void;
  setUserId: (userId: string) => Promise<void>;
  setAttribute: (name: string, value: string) => Promise<void>;
  setCrashlyticsCollectionEnabled: (enabled: boolean) => Promise<void>;
  crash: () => void;
};

let analyticsModule: (() => AnalyticsInstance) | null = null;
let crashlyticsModule: (() => CrashlyticsInstance) | null = null;
if (Platform.OS !== 'web') {
  try {
    // Native-only; absent on web and in Expo Go (no dev/prod build yet).
    analyticsModule = require('@react-native-firebase/analytics').default;
  } catch {
    analyticsModule = null;
  }
  try {
    crashlyticsModule = require('@react-native-firebase/crashlytics').default;
  } catch {
    crashlyticsModule = null;
  }
}

/**
 * Flipped to false the first time the native module throws (Expo Go), so we
 * stop retrying — and stop spamming the Metro console — for the session.
 */
let analyticsUsable = analyticsModule !== null;
let crashUsable = crashlyticsModule !== null;

/**
 * Run a native-module call, swallowing ANY throw. Returns true when the call
 * went through. Never re-throws: callers are instrumentation sites.
 */
function safe(label: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    if (isDev) {
      const message = (e as { message?: string })?.message ?? String(e);
      console.log(`[observability] ${label} unavailable — ${message}`);
    }
    return false;
  }
}

/**
 * Swallow a rejected native promise.
 *
 * `safe()` only catches SYNCHRONOUS throws. Every Analytics/Crashlytics setter
 * returns a promise, and a native-side failure (bad param, collection disabled,
 * no default app) rejects it instead of throwing. Left unhandled that surfaces
 * as an "Unhandled promise rejection" — instrumentation noise that can mask the
 * real error in the flow being instrumented. Same rule as `safe()`: an
 * instrumentation call must never be able to affect its caller.
 */
function swallow(result: unknown): void {
  const p = result as { catch?: (fn: (e: unknown) => void) => unknown } | undefined;
  if (p && typeof p.catch === 'function') {
    p.catch((e: unknown) => {
      if (isDev) console.log('[observability] async native call rejected —', e);
    });
  }
}

/** Resolve the Analytics instance, disabling it permanently if it throws. */
function withAnalytics(label: string, use: (a: AnalyticsInstance) => void): void {
  const mod = analyticsModule;
  if (!analyticsUsable || !mod) return;
  if (!safe(label, () => use(mod()))) analyticsUsable = false;
}

/** Resolve the Crashlytics instance, disabling it permanently if it throws. */
function withCrashlytics(label: string, use: (c: CrashlyticsInstance) => void): void {
  const mod = crashlyticsModule;
  if (!crashUsable || !mod) return;
  if (!safe(label, () => use(mod()))) crashUsable = false;
}

/** True when native Analytics is available (a real build, not web/Expo Go). */
export const isAnalyticsAvailable = analyticsModule !== null;

/** True when native Crashlytics is available (a real build, not web/Expo Go). */
export const isCrashReportingAvailable = crashlyticsModule !== null;

/** Coerce any thrown value into a proper Error for recordError. */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

export type AuthEvent =
  | 'sign_up'
  | 'login'
  | 'login_google'
  | 'login_apple'
  | 'logout'
  | 'password_reset_requested'
  | 'verification_email_sent'
  | 'account_deleted';

/**
 * Track a product/auth analytics event.
 * Param values must be primitives (string/number/boolean) — GA4 rejects
 * nested objects/arrays, so keep call sites flat.
 */
export function trackEvent(
  name: AuthEvent | string,
  params?: Record<string, string | number | boolean>,
): void {
  if (isDev) console.log(`[analytics] ${name}`, params ?? {});
  withAnalytics(`logEvent(${name})`, (a) => {
    swallow(a.logEvent(name, params));
  });
}

/** Track a screen view (call on navigation change). No-op on web/Expo Go. */
export function trackScreenView(screenName: string, screenClass?: string): void {
  if (isDev) console.log(`[analytics] screen_view`, { screenName, screenClass });
  withAnalytics('logScreenView', (a) => {
    swallow(a.logScreenView({ screen_name: screenName, screen_class: screenClass ?? screenName }));
  });
}

/** Attribute subsequent analytics events to a user (pass null to clear). */
export function setAnalyticsUser(userId: string | null): void {
  withAnalytics('setUserId', (a) => {
    swallow(a.setUserId(userId));
  });
}

/** Attach a user-scoped property (e.g. plan tier, category) to future events. */
export function setAnalyticsUserProperty(name: string, value: string | null): void {
  withAnalytics('setUserProperty', (a) => {
    swallow(a.setUserProperty(name, value));
  });
}

/**
 * Enable analytics + crash collection. Safe to call once at startup; a no-op
 * on web/Expo Go. (Crash collection is also controlled by
 * `crashlytics_auto_collection_enabled` in firebase.json — this just makes it
 * explicit / re-enables after opt-out.)
 */
export function initObservability(): void {
  withAnalytics('setAnalyticsCollectionEnabled', (a) => {
    swallow(a.setAnalyticsCollectionEnabled(true));
  });
  withCrashlytics('setCrashlyticsCollectionEnabled', (c) => {
    swallow(c.setCrashlyticsCollectionEnabled(true));
  });

  // Record otherwise-uncaught JS errors, then defer to RN's default handler
  // (so the dev RedBox / prod behaviour is preserved). Installed once, and
  // independently of whether Crashlytics is usable — `reportError` no-ops on
  // its own when it isn't.
  const g = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
    __crashHandlerInstalled?: boolean;
  };
  if (g.ErrorUtils && !g.__crashHandlerInstalled) {
    const previous = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, isFatal ? 'uncaught-fatal' : 'uncaught');
      previous(error, isFatal);
    });
    g.__crashHandlerInstalled = true;
  }
}

/** Attribute subsequent crash reports to a user (pass null to clear). */
export function setCrashUser(userId: string | null): void {
  withCrashlytics('setUserId', (c) => {
    swallow(c.setUserId(userId ?? ''));
  });
}

/** Attach a searchable key/value to future crash reports. */
export function setCrashAttribute(name: string, value: string): void {
  withCrashlytics('setAttribute', (c) => {
    swallow(c.setAttribute(name, value));
  });
}

/** Add a breadcrumb that shows up in the next crash report's timeline. */
export function logBreadcrumb(message: string): void {
  if (isDev) console.log(`[crashlytics] ${message}`);
  withCrashlytics('log', (c) => c.log(message));
}

/** Report an unexpected error (non-fatal) for later triage. */
export function reportError(error: unknown, context?: string): void {
  if (isDev) console.warn(`[crashlytics] ${context ?? 'error'}`, error);
  withCrashlytics('recordError', (c) => {
    if (context) c.log(context);
    c.recordError(toError(error));
  });
}

/** Force a native crash — for verifying the Crashlytics setup only. */
export function testCrash(): void {
  withCrashlytics('crash', (c) => c.crash());
}
