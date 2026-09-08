# Firebase Authentication + SQLite — Setup

Firebase is used **only** for authentication. All user data (profile, tasks,
planner, reminders, notifications, habits, analytics, AI history, calendar)
lives locally in **SQLite**. No Firestore / Realtime DB / Storage.
Email verification is required before a new account can access the app.
Firebase sends the **verification** email on signup and the **password
reset** email from the forgot-password screen.

## 1. Install packages

```bash
npx expo install firebase expo-sqlite expo-auth-session expo-apple-authentication expo-crypto @react-native-async-storage/async-storage zustand
```

(`expo install` picks versions matching your Expo SDK; it will correct the
approximate versions already written into `package.json`.)

## 2. Fill in `.env`

Create a Firebase project → add a **Web app** → copy the config into `.env`
(see `.env.example`). Enable **Email/Password** under Authentication →
Sign-in method. For social sign-in, also enable **Google** and **Apple** and
paste the OAuth client IDs into the `EXPO_PUBLIC_GOOGLE_*` vars. Leaving the
Google IDs blank simply hides the Google button until configured.

Restart the dev server after editing `.env` (env vars are inlined at build).

## 3. Google & Apple

- **Google** uses `expo-auth-session`. For standalone iOS you must add your
  reversed iOS client ID as a URL scheme. The app `scheme` is already
  `aitimetableplanner`.
- **Apple** uses `expo-apple-authentication`. `app.json` already sets
  `ios.usesAppleSignIn: true` and registers the plugin. Apple Sign In requires
  a **dev/production build** (not Expo Go) and an Apple Developer account.

## 4. Run

```bash
npx expo start        # Expo Go works for email/password + Google
# Apple Sign In + a fully native build:
npx expo run:ios      # or: eas build
```

## 5. Architecture map

| Concern | Location |
| --- | --- |
| Firebase init (auth only) | `lib/firebase/config.ts` |
| Error → friendly message | `lib/firebase/errors.ts` |
| Analytics + Crashlytics | `lib/services/observability.ts` |
| Auth service (register/login/google/apple/reset/logout/delete/session) | `lib/auth/auth-service.ts` |
| Verification / reset email REST fallback | `lib/auth/email-delivery.ts` |
| Google/Apple hook | `lib/auth/use-social-auth.ts` |
| SQLite init | `lib/db/database.ts` |
| Local profile repo | `lib/db/profile-repository.ts` |
| Auth state + session restore | `store/auth-store.ts` |

## 6. Analytics & Crashlytics (native)

The Firebase **JS SDK** cannot do Crashlytics, and its Analytics is web-only,
so both are provided by `@react-native-firebase/{analytics,crashlytics}`
(already installed + registered as config plugins in `app.json`).
`lib/services/observability.ts` is the single integration point:

- `trackEvent(name, params)` — logs a GA4 event (`analytics().logEvent`).
- `trackScreenView(name)` — logs a screen view; wired automatically in
  `app/_layout.tsx` via `usePathname()`, firing on every route change.
- `setAnalyticsUser(uid)` / `setAnalyticsUserProperty(name, value)` — attach
  the signed-in user to subsequent events.
- `reportError(error, context)` / `setCrashUser(uid)` — Crashlytics, unchanged.
- `initObservability()` — enables collection for both SDKs at startup.

Both are NATIVE modules: unavailable on web and in Expo Go, so every helper
lazily requires the module behind a platform guard and no-ops (dev console
log only) when it isn't there. **You need a dev/production build** (not Expo
Go) to see events in the Firebase console:

```bash
npx expo run:android   # or: eas build -p android --profile development
```

Android reads `google-services.json` (already present at the project root).
iOS additionally needs a `GoogleService-Info.plist` from the Firebase console
placed at the project root before `npx expo run:ios` / an iOS EAS build.

## 7. Emails: how the two flows work

| Flow | Entry point | Firebase call |
| --- | --- | --- |
| Verify the address is real | sign-up, and "Resend email" on `/verify-email` | `sendEmailVerification(user)` |
| Reset a forgotten password | `/forgot-password` | `sendPasswordResetEmail(auth, email)` |

Both go through `lib/auth/auth-service.ts`, and both have the same shape:

1. Try the JS SDK.
2. If it throws, retry once against the Identity Toolkit REST endpoint
   (`lib/auth/email-delivery.ts`). This is the same HTTP call the SDK makes
   internally, but it returns the server's own error body — which is the only
   place the real reason (`QUOTA_EXCEEDED`, `API_KEY_ANDROID_APP_BLOCKED`,
   `OPERATION_NOT_ALLOWED`, ...) is visible. The SDK collapses all of them into
   a bare `auth/...` code, usually `auth/internal-error`.
3. Report the specific reason to the UI, and log one
   `[auth][email] ...:sent|failed` line to the console in every build profile.

A 60-second cooldown per address is enforced client-side
(`RESEND_COOLDOWN_SECONDS`). Firebase throttles these emails server-side and
answers a burst with `auth/too-many-requests` — which would block the one retry
the user actually needed.

Registration deliberately never fails because of the email: the account exists
either way, and `RegisterOutcome.verificationSent` tells the UI whether it may
say "check your inbox".

## 8. Troubleshooting: "no email ever arrives"

Run the self-test first. It calls the same REST endpoint the app does and prints
Google's verbatim answer:

```bash
node scripts/check-firebase-email.mjs you@example.com
```

Pass an address that **is registered** in this project — the script sends it a
real password reset email. It prints a concrete fix for every error code it
recognises. If it reports `ACCEPTED`, Firebase queued the mail and the problem
is delivery, not the app.

In rough order of how often each one is the answer:

1. **Spam / Promotions.** The sender is
   `noreply@<project>.firebaseapp.com` with no SPF/DKIM alignment for your
   domain, so filtering is common. University and corporate mail servers often
   drop it outright — test with a Gmail address before assuming a bug.
2. **Email enumeration protection** (Authentication → Settings) is **on by
   default**. With it on, `sendPasswordResetEmail` returns *success* for an
   address that has no account, and sends nothing. Confirm the address exists
   under Authentication → Users. This is why the forgot-password screen says
   "if an account exists" rather than promising an email.
3. **Daily email quota exhausted.** Free (Spark) projects get a few hundred
   verification/reset emails per day, and testing burns through them fast. The
   self-test reports this as `QUOTA_EXCEEDED`; it resets after 24 hours.
4. **A restricted API key.** If the web API key in `.env` has an *application
   restriction* in Google Cloud → Credentials (Android apps, HTTP referrers,
   IP addresses), Google refuses the request with 403 and the SDK reports
   `auth/internal-error`. Set Application restrictions to **None** for the web
   key, or add this app to it. Note `google-services.json` carries a *different*
   key — the JS SDK uses the one in `.env` / `app.json`, not that one.
5. **Email/Password provider disabled** — Authentication → Sign-in method.
   Surfaces as `OPERATION_NOT_ALLOWED`.
6. **Email template broken** — Authentication → Templates. A customised sender
   or action URL that no longer resolves gives `INVALID_SENDER` /
   `UNAUTHORIZED_DOMAIN`.

While reproducing on a device, watch Metro for the `[auth][email]` lines: each
attempt logs the transport used (`sdk` or `rest-fallback`), the SDK code, and
the HTTP status plus server code when it failed.

## Notes

- `lib/auth-service.ts` (the old local-only auth from the previous phase) is no
  longer used and can be deleted.
- Remember Me: when unchecked, the session is signed out on the next cold start.
- Sign-up rejects addresses that cannot possibly answer a verification email
  (`validateSignupEmail` in `lib/validation.ts`): typo'd provider domains
  (`gmial.com`), RFC 2606 placeholders (`example.com`) and disposable inboxes.
  Log in and password reset stay on the format-only `validateEmail`, so no
  existing account is ever locked out by a list change.
