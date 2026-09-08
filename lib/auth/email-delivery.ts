/**
 * Direct Identity Toolkit REST access for the two emails Firebase sends us:
 * the address-verification email and the password-reset email.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE THE SDK
 * ---------------------------------------------------------------------------
 * `sendEmailVerification()` / `sendPasswordResetEmail()` wrap this exact HTTP
 * call, but they discard the server's explanation: every backend rejection is
 * flattened into a short `auth/...` code (often `auth/internal-error`), and
 * the body that says *why* — `API_KEY_ANDROID_APP_BLOCKED`, `QUOTA_EXCEEDED`,
 * `OPERATION_NOT_ALLOWED`, `INVALID_SENDER`, ... — is thrown away.
 *
 * Calling the endpoint ourselves gives two things:
 *
 *   1. A second delivery attempt. The SDK builds its request from an internal
 *      auth state machine; this is a plain `fetch` with the API key and, for
 *      verification, a freshly minted ID token. When the SDK path fails for a
 *      client-side reason, this one can still get the mail out.
 *   2. A usable error message when it fails too. The raw server code is
 *      translated into "here is the switch to flip in the console", which is
 *      the difference between a five-minute fix and a blind hunt.
 *
 * This is Firebase's public REST surface for the *web* API key — the same key
 * already shipped in the JS bundle — so it adds no new secret and no new
 * dependency.
 * ---------------------------------------------------------------------------
 */
import { User } from 'firebase/auth';

import { firebaseConfig } from '@/lib/firebase/config';

const ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode';
const REQUEST_TIMEOUT_MS = 15_000;

export type DeliveryPurpose = 'VERIFY_EMAIL' | 'PASSWORD_RESET';

export type RestDelivery =
  | { ok: true; status: number }
  | {
      ok: false;
      /** HTTP status, or 0 when the request never reached Google. */
      status: number;
      /** e.g. "QUOTA_EXCEEDED", or null when the body wasn't parseable. */
      serverCode: string | null;
      /** Google's full message, useful verbatim in logs. */
      serverMessage: string | null;
      /** Plain-English, action-oriented explanation for the UI. */
      reason: string;
    };

/**
 * Google returns either
 *   { error: { code: 400, message: "QUOTA_EXCEEDED : ...", errors: [...] } }
 * or, for key/permission problems,
 *   { error: { code: 403, message: "Requests from this Android...", status: "PERMISSION_DENIED" } }
 * The leading token of `message` is the machine-readable part.
 */
type ErrorBody = { error?: { code?: number; message?: string; status?: string } };

function parseServerCode(message: string | null | undefined): string | null {
  if (!message) return null;
  const head = message.split(':')[0]?.trim();
  return head && /^[A-Z_]+$/.test(head) ? head : null;
}

/**
 * Turn Google's code into something the person holding the phone — or the
 * developer reading the toast — can act on.
 */
export function explainDeliveryFailure(
  serverCode: string | null,
  serverMessage: string | null,
  status: number,
  purpose: DeliveryPurpose,
): string {
  const what = purpose === 'VERIFY_EMAIL' ? 'verification email' : 'password reset email';

  switch (serverCode) {
    case 'QUOTA_EXCEEDED':
      return `Firebase has hit its daily email quota for this project, so the ${what} could not be sent. Try again tomorrow or raise the quota in the Firebase console.`;
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many requests from this device. Please wait a few minutes and try again.';
    case 'EMAIL_NOT_FOUND':
      return 'No account is registered with this email address. Please sign up first.';
    case 'INVALID_EMAIL':
      return 'That email address is not valid.';
    case 'MISSING_EMAIL':
      return 'Please enter your email address.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Email/Password sign-in is disabled for this Firebase project. Enable it under Authentication → Sign-in method.';
    case 'INVALID_ID_TOKEN':
    case 'TOKEN_EXPIRED':
    case 'USER_NOT_FOUND':
      return 'Your session expired. Please log in again and retry.';
    case 'INVALID_SENDER':
    case 'INVALID_MESSAGE_PAYLOAD':
    case 'INVALID_RECIPIENT_EMAIL':
      return `Firebase rejected the email template for this project, so the ${what} was not sent. Check Authentication → Templates in the Firebase console.`;
    case 'UNAUTHORIZED_DOMAIN':
      return 'The link domain is not authorised. Add it under Authentication → Settings → Authorized domains.';
    case 'API_KEY_ANDROID_APP_BLOCKED':
    case 'API_KEY_IOS_APP_BLOCKED':
    case 'API_KEY_HTTP_REFERRER_BLOCKED':
    case 'API_KEY_IP_ADDRESS_BLOCKED':
      return 'This Firebase API key is restricted and is refusing requests from the app. In Google Cloud → Credentials, either remove the key\'s application restriction or add this app to it.';
    case 'PERMISSION_DENIED':
      return 'Google rejected the request for this API key. Make sure the Identity Toolkit API is enabled and the key has no blocking restrictions.';
    case 'API_KEY_INVALID':
      return 'The Firebase API key is invalid. Re-copy it from Firebase → Project settings → Your apps.';
    default:
      break;
  }

  if (status === 403) {
    return `Google refused the request (403). The Firebase API key is most likely restricted — check Google Cloud → Credentials. ${serverMessage ?? ''}`.trim();
  }
  if (status === 0) {
    return `Could not reach Firebase to send the ${what}. Check the device's internet connection.`;
  }
  return `Firebase could not send the ${what} (HTTP ${status}${serverCode ? ` ${serverCode}` : ''}).`;
}

async function postOobCode(
  body: Record<string, unknown>,
  purpose: DeliveryPurpose,
): Promise<RestDelivery> {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      serverCode: 'API_KEY_MISSING',
      serverMessage: null,
      reason: 'Firebase is not configured: the API key is missing.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: purpose, ...body }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (response.ok) return { ok: true, status: response.status };

    let parsed: ErrorBody = {};
    try {
      parsed = JSON.parse(raw) as ErrorBody;
    } catch {
      // Non-JSON body (an HTML error page from a proxy, typically).
    }
    const serverMessage = parsed.error?.message ?? (raw ? raw.slice(0, 300) : null);
    const serverCode = parseServerCode(serverMessage) ?? parsed.error?.status ?? null;
    return {
      ok: false,
      status: response.status,
      serverCode,
      serverMessage,
      reason: explainDeliveryFailure(serverCode, serverMessage, response.status, purpose),
    };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    const serverMessage = aborted ? 'Request timed out.' : ((e as { message?: string })?.message ?? String(e));
    return {
      ok: false,
      status: 0,
      serverCode: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      serverMessage,
      reason: explainDeliveryFailure(null, serverMessage, 0, purpose),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send the verification email over REST. Needs a current ID token, so the
 * caller must be signed in; `getIdToken(true)` forces a refresh so an expired
 * token isn't the thing that fails.
 */
export async function sendVerificationEmailViaRest(user: User): Promise<RestDelivery> {
  let idToken: string;
  try {
    idToken = await user.getIdToken(true);
  } catch (e) {
    const serverMessage = (e as { message?: string })?.message ?? String(e);
    return {
      ok: false,
      status: 0,
      serverCode: 'TOKEN_REFRESH_FAILED',
      serverMessage,
      reason: 'Your session expired. Please log in again and retry.',
    };
  }
  return postOobCode({ idToken }, 'VERIFY_EMAIL');
}

/** Send the password-reset email over REST. No sign-in required. */
export function sendPasswordResetViaRest(email: string): Promise<RestDelivery> {
  return postOobCode({ email }, 'PASSWORD_RESET');
}
