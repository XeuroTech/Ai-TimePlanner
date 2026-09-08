import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
// getReactNativePersistence exists at runtime: Metro resolves `firebase/auth` -> its
// `browser` field (dist/esm/index.esm.js) which re-exports `@firebase/auth`, and
// `@firebase/auth` declares `"react-native": "dist/rn/index.js"` — the RN bundle that
// does export this member. The TYPES always point at the browser build, so TypeScript
// never sees it. @ts-expect-error suppresses only that gap.
// @ts-expect-error - see above
import { getReactNativePersistence } from 'firebase/auth';

/**
 * Firebase is used for AUTHENTICATION ONLY (no Firestore / RTDB / Storage).
 *
 * ---------------------------------------------------------------------------
 * WHY NOTHING IN THIS FILE RUNS AT MODULE SCOPE
 * ---------------------------------------------------------------------------
 * This module is reachable from `app/_layout.tsx`
 * (_layout -> store/auth-store -> lib/auth/auth-service -> here), so it is
 * required by expo-router while it is *loading the root route*.
 *
 * Metro's module loader wraps that outermost require in `guardedLoadModule`
 * (metro-runtime/src/polyfills/require.js). If a module throws inside its
 * factory, the guard calls `ErrorUtils.reportFatalError(e)` and then returns
 * `undefined` instead of re-throwing. expo-router's `fromImport(value, res)`
 * (expo-router/build/useScreens.js) immediately destructures that result:
 *
 *     function fromImport(value, { ErrorBoundary, ...component }) { ... }
 *
 * Destructuring `undefined` produces the infamous, unrelated-looking
 *     TypeError: Cannot read property 'ErrorBoundary' of undefined
 * and the app dies on a black screen right after the splash.
 *
 * So: no top-level `throw`, and no top-level `initializeApp` / `initializeAuth`.
 * Everything is created lazily on first use, behind `getFirebaseAuth()`.
 * ---------------------------------------------------------------------------
 *
 * Config resolution order (first non-empty wins):
 *   1. EXPO_PUBLIC_FIREBASE_* env vars — inlined by babel-preset-expo at build
 *      time; present locally via .env, or on EAS via `eas env:push`.
 *   2. `expo.extra.firebase` in app.json — committed, so an EAS build always
 *      has a working config even though .env is gitignored and never uploaded.
 *
 * These are Firebase *web client* values. They are not secrets: they ship
 * inside the JS bundle either way, and access is controlled by Firebase
 * Security Rules / Auth settings, not by hiding the key.
 */

export type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

/** `expo.extra.firebase` from app.json, or `{}` when absent. */
function extraConfig(): FirebaseWebConfig {
  const extra = Constants.expoConfig?.extra as { firebase?: FirebaseWebConfig } | undefined;
  return extra?.firebase ?? {};
}

/** Treat empty strings as missing so a blank EAS variable can't win. */
function pick(envValue: string | undefined, extraValue: string | undefined): string | undefined {
  return envValue && envValue.length > 0 ? envValue : extraValue;
}

function resolveConfig(): FirebaseWebConfig {
  const e = extraConfig();
  return {
    apiKey: pick(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, e.apiKey),
    authDomain: pick(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, e.authDomain),
    projectId: pick(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, e.projectId),
    storageBucket: pick(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, e.storageBucket),
    messagingSenderId: pick(
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      e.messagingSenderId,
    ),
    appId: pick(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, e.appId),
    measurementId: pick(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID, e.measurementId),
  };
}

/**
 * Safe to evaluate at module scope: it only reads already-inlined strings and
 * the Expo manifest. No Firebase SDK call, so it cannot throw.
 */
export const firebaseConfig: FirebaseWebConfig = resolveConfig();

/**
 * `apiKey.includes(':')` mirrors @firebase/auth's own `invalid-api-key`
 * assertion, so a swapped apiKey/appId is caught here instead of blowing up
 * inside the SDK.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && !firebaseConfig.apiKey.includes(':') && firebaseConfig.appId,
);

/** Human-readable reason the config is unusable (null when it is fine). */
export function firebaseConfigError(): string | null {
  if (isFirebaseConfigured) return null;
  const missing = (['apiKey', 'appId', 'projectId'] as const).filter((k) => !firebaseConfig[k]);
  if (missing.length) {
    return (
      `Firebase is not configured: missing ${missing.join(', ')}. ` +
      'Set the EXPO_PUBLIC_FIREBASE_* variables (`eas env:push .env`) or fill in ' +
      '`expo.extra.firebase` in app.json.'
    );
  }
  return 'Firebase apiKey looks invalid — it must not contain ":" (that is the appId).';
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

/** Lazily create (once) the Firebase app. Throws only when actually called. */
export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  const error = firebaseConfigError();
  if (error) throw new Error(`[firebase] ${error}`);
  appInstance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return appInstance;
}

/**
 * Lazily create (once) the Auth instance with React Native persistence, so the
 * session survives app restarts.
 *
 * `initializeAuth` runs the auth component factory synchronously, and that
 * factory asserts a valid apiKey and throws `auth/invalid-api-key`. That is
 * exactly why this must never run at module scope — see the block comment at
 * the top of this file.
 */
export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // Fast Refresh / double-init: reuse the already-created instance.
    if ((e as { code?: string }).code === 'auth/already-initialized') {
      authInstance = getAuth(app);
    } else {
      throw e;
    }
  }
  return authInstance;
}
