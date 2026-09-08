/** Lightweight, dependency-free form validators used across auth screens. */

/**
 * Deliberately stricter than the old `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, which
 * accepted `a@b..c`, `a@-b.com` and `a@b.c`. Still not RFC 5322 — the point is
 * to reject addresses that cannot receive mail, and to do it before Firebase
 * charges a send attempt against the project's daily quota.
 */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

/**
 * Domains reserved by RFC 2606 / RFC 6761 plus the usual placeholders. Mail to
 * these is guaranteed to bounce, so an account created with one can never be
 * verified — the address has to be rejected at sign-up, not discovered later.
 */
const UNDELIVERABLE_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.edu',
  'test.com',
  'test.net',
  'email.com',
  'domain.com',
  'yourdomain.com',
  'mydomain.com',
  'localhost',
  'localhost.localdomain',
  'invalid',
  'test',
  'local',
  'none.com',
  'no.com',
  'abc.com',
  'asdf.com',
  'fake.com',
  'nomail.com',
  'noemail.com',
]);

/**
 * Throwaway inboxes. A sign-up here passes verification and then becomes an
 * unrecoverable account the moment the inbox expires, so block it up front.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  '10minutemail.net',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'getnada.com',
  'dispostable.com',
  'trashmail.com',
  'maildrop.cc',
  'mailnesia.com',
  'fakeinbox.com',
  'tempinbox.com',
  'mohmal.com',
  'mytemp.email',
  'emailondeck.com',
  'moakt.com',
  'inboxkitten.com',
  'tmpmail.org',
  'burnermail.io',
]);

/**
 * Misspellings of the big providers, mapped to what was almost certainly
 * meant. These are real accounts-lost-forever cases: the address is valid, the
 * mail goes nowhere, and the user is convinced the app is broken.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'g-mail.com': 'gmail.com',
  'googlemail.co': 'gmail.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlok.com': 'outlook.com',
  'oulook.com': 'outlook.com',
  'icloud.co': 'icloud.com',
  'iclould.com': 'icloud.com',
  'iclod.com': 'icloud.com',
  'protonmail.co': 'protonmail.com',
};

/** Lowercased, trimmed — the form Firebase should always be handed. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/**
 * Format-only check. Used wherever the address must simply be well-formed —
 * log in and password reset, where the account already exists and extra
 * opinions would only lock a real user out.
 */
export function validateEmail(value: string): string | null {
  const v = normalizeEmail(value);
  if (!v) return 'Email is required.';
  if (v.length > 254) return 'That email address is too long.';
  if (v.includes('..')) return 'Enter a valid email address.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return null;
}

/**
 * Sign-up check: format, plus "can this address actually receive the
 * verification email?".
 *
 * Only ever applied at registration. Whether an address is *real* is still
 * settled by the verification email itself — this just refuses the addresses
 * that provably cannot answer one, so the user finds out now rather than after
 * being locked out of an unverifiable account.
 */
export function validateSignupEmail(value: string): string | null {
  const formatError = validateEmail(value);
  if (formatError) return formatError;

  const email = normalizeEmail(value);
  const domain = domainOf(email);

  const suggestion = DOMAIN_TYPOS[domain];
  if (suggestion && suggestion !== domain) {
    const local = email.slice(0, email.lastIndexOf('@'));
    return `Did you mean ${local}@${suggestion}?`;
  }
  if (UNDELIVERABLE_DOMAINS.has(domain)) {
    return 'Please use a real email address — this one cannot receive the verification email.';
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return 'Temporary email addresses are not supported. Please use a permanent one.';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length < 6) return 'Password must be at least 6 characters.';
  return null;
}

export function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required.';
  if (value.trim().length < 2) return 'Name is too short.';
  return null;
}

export function validateRequired(value: string, label = 'This field'): string | null {
  return value.trim() ? null : `${label} is required.`;
}

export function validateMatch(a: string, b: string): string | null {
  return a === b ? null : 'Passwords do not match.';
}
