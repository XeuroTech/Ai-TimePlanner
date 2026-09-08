/**
 * Maps Firebase Auth error codes into short, user-friendly messages.
 *
 * Unmapped codes used to collapse into a bare "Something went wrong", which
 * made the email-sending failures impossible to diagnose from a device. The
 * fallback now keeps the raw code visible, and the map covers every code the
 * verification / password-reset paths can realistically produce.
 */
const MESSAGES: Record<string, string> = {
  // Credentials / account state
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found for this email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/missing-password': 'Please enter your password.',
  'auth/missing-email': 'Please enter your email address.',

  // Session / token — the common cause of a failed "Resend email"
  'auth/user-token-expired': 'Your session expired. Please log in again to resend the email.',
  'auth/invalid-user-token': 'Your session is no longer valid. Please log in again.',
  'auth/requires-recent-login': 'Please log in again to complete this action.',
  'auth/user-mismatch': 'Those credentials belong to a different account.',
  'auth/null-user': 'You are not signed in.',

  // Rate limiting / quota — Firebase throttles verification + reset emails
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/quota-exceeded':
    "This project's daily email limit is used up. Try again tomorrow, or raise the quota in Firebase.",

  // Project configuration — what to actually go and fix in the console
  'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
  'auth/invalid-api-key': 'The Firebase API key is invalid. Check your EXPO_PUBLIC_FIREBASE_* values.',
  'auth/api-key-not-valid': 'The Firebase API key is invalid. Check your EXPO_PUBLIC_FIREBASE_* values.',
  'auth/app-not-authorized':
    'This app is not authorised to use this Firebase project. Check the API key restrictions in Google Cloud.',
  'auth/unauthorized-domain':
    'This domain is not in Firebase Authentication → Settings → Authorized domains.',
  'auth/unauthorized-continue-uri':
    'The link domain is not in Firebase Authentication → Settings → Authorized domains.',
  'auth/invalid-continue-uri': 'The link URL in the email settings is invalid.',
  'auth/missing-android-pkg-name': 'Android package name is missing from the email link settings.',
  'auth/invalid-recipient-email': 'Firebase rejected this recipient address.',
  'auth/invalid-sender': 'The sender address configured for this project is invalid.',
  'auth/invalid-message-payload': 'The email template for this project is invalid.',

  // Transport
  'auth/network-request-failed': 'Network error. Check your connection and retry.',
  'auth/timeout': 'The request timed out. Please try again.',
  'auth/web-storage-unsupported': 'Storage is unavailable on this device.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
};

type FirebaseErrorLike = { code?: string; message?: string };

/** The `auth/...` code, or null when the thrown value carries none. */
export function authErrorCode(error: unknown): string | null {
  const code = (error as FirebaseErrorLike)?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

export function friendlyAuthError(error: unknown): string {
  const code = authErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  // Keep the code — a message you can search for beats a message you can't.
  if (code) return `Something went wrong (${code}). Please try again.`;
  return 'Something went wrong. Please try again.';
}

/** True for errors we didn't anticipate (worth reporting to Crashlytics). */
export function isUnexpectedAuthError(error: unknown): boolean {
  const code = authErrorCode(error);
  return !code || !(code in MESSAGES);
}
