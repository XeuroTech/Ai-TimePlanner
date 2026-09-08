/**
 * Landing route for the Google Drive OAuth redirect.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Drive sign-in ends with Google redirecting the browser to
 *
 *     com.googleusercontent.apps.<client-id>:/oauthredirect?code=…
 *
 * That scheme is registered in `app.json` -> `expo.scheme`, so Android hands the
 * URL to this app. TWO consumers then see it:
 *
 *   1. `expo-auth-session` — the `WebBrowser.openAuthSessionAsync` listener
 *      opened by `AuthRequest#promptAsync()` resolves with the authorization
 *      code, which `lib/services/google-drive.ts` exchanges for tokens. This is
 *      the consumer that matters, and it works.
 *   2. `expo-router`'s deep-link handler — it also receives the URL and tries to
 *      navigate to the path `/oauthredirect`. With no matching route it renders
 *      the built-in **"Unmatched Route"** screen on top of the app, which looks
 *      like a crash even though the sign-in succeeded.
 *
 * Declaring the route silences (2) without affecting (1): by the time this
 * component renders, the code has already been handed to `promptAsync()`'s
 * resolver, so all this screen has to do is get out of the way.
 *
 * `<Redirect>` rather than `router.replace()` inside an effect, so the swap
 * happens during the first render and the user never sees this screen at all.
 * The root `useAuthGate()` still applies — a signed-out user ends up on /login
 * instead of /backup, which is the correct behaviour.
 * ---------------------------------------------------------------------------
 */
import { Redirect } from 'expo-router';

export default function OAuthRedirect() {
  return <Redirect href="/backup" />;
}
