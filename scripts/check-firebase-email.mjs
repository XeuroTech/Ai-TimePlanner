#!/usr/bin/env node
/**
 * Firebase email self-test.
 *
 *   node scripts/check-firebase-email.mjs you@example.com
 *
 * Asks the Identity Toolkit REST API — the exact endpoint the app's
 * `sendPasswordResetEmail()` wraps — to send a password reset email, and prints
 * what Google says back.
 *
 * The point is that the Firebase JS SDK throws away the server's explanation:
 * a restricted API key, a used-up daily quota and a disabled sign-in provider
 * all surface in the app as the same terse `auth/...` code. Here you get the
 * raw HTTP status and error body, so "no email arrived" turns into a specific
 * thing to go and fix.
 *
 * Nothing is written and no account is created — probe 1 deliberately sends a
 * malformed address so it can only ever be rejected.
 *
 * NOTE: if the address you pass is registered, this really does send it a
 * password reset email. That is the test.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://identitytoolkit.googleapis.com/v1';

const ESC = '\u001b[';
const paint = (code, s) => `${ESC}${code}m${s}${ESC}0m`;
const bold = (s) => paint(1, s);
const green = (s) => paint(32, s);
const red = (s) => paint(31, s);
const yellow = (s) => paint(33, s);
const dim = (s) => paint(2, s);

/** Minimal .env reader — no dependency, and it must work before install. */
function readEnv() {
  const out = {};
  for (const name of ['.env', '.env.local']) {
    let text;
    try {
      text = readFileSync(join(ROOT, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) out[key] = value;
    }
  }
  return out;
}

/** Fall back to app.json's `expo.extra.firebase`, exactly like the app does. */
function readAppJsonFirebase() {
  try {
    const json = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
    return json?.expo?.extra?.firebase ?? {};
  } catch {
    return {};
  }
}

async function post(path, body, apiKey) {
  const response = await fetch(`${ENDPOINT}/${path}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: response.status, ok: response.ok, json, text };
}

const serverCodeOf = (result) => {
  const message = result.json?.error?.message ?? '';
  const head = message.split(':')[0]?.trim();
  return /^[A-Z_]+$/.test(head) ? head : (result.json?.error?.status ?? null);
};

const ADVICE = {
  QUOTA_EXCEEDED:
    "The project's daily email quota is used up — this is the classic \"it worked yesterday\" cause.\n" +
    '   Wait for the quota to reset (24h) or raise it: Firebase console → Authentication → Settings → \n' +
    '   "Email sending quota". Free (Spark) projects are limited to a few hundred emails a day.',
  TOO_MANY_ATTEMPTS_TRY_LATER:
    'Firebase is rate-limiting this address or IP. Wait a few minutes, then retry.',
  EMAIL_NOT_FOUND:
    'No account exists for this address, so nothing was sent. Note that email enumeration protection\n' +
    '   normally hides this — seeing it means the protection is OFF for this project.',
  OPERATION_NOT_ALLOWED:
    'Email/Password sign-in is DISABLED. Firebase console → Authentication → Sign-in method → \n' +
    '   Email/Password → Enable.',
  API_KEY_ANDROID_APP_BLOCKED:
    'The API key has an Android app restriction that this caller does not satisfy.\n' +
    '   Google Cloud console → APIs & Services → Credentials → this key → Application restrictions → None\n' +
    '   (or add the app\'s package name + SHA-1).',
  API_KEY_HTTP_REFERRER_BLOCKED:
    'The API key is restricted to specific HTTP referrers, which a mobile app cannot send.\n' +
    '   Google Cloud console → Credentials → this key → Application restrictions → None.',
  API_KEY_IOS_APP_BLOCKED:
    'The API key has an iOS bundle-ID restriction that this caller does not satisfy.\n' +
    '   Google Cloud console → Credentials → this key → Application restrictions.',
  API_KEY_INVALID:
    'The API key is wrong. Re-copy it from Firebase console → Project settings → Your apps → Web app → \n' +
    '   apiKey, and make sure it is not the appId by mistake.',
  PERMISSION_DENIED:
    'Google refused the key. Check that the "Identity Toolkit API" is enabled for the project and that\n' +
    '   the key has no API restrictions excluding it.',
  INVALID_SENDER:
    'The email template for this project has an invalid sender. Firebase console → Authentication → \n' +
    '   Templates → reset the sender to the default.',
  SERVICE_DISABLED:
    'The Identity Toolkit API is not enabled for this project. Google Cloud console → APIs & Services → \n' +
    '   Library → "Identity Toolkit API" → Enable. (Creating the Firebase web app normally does this.)',
  IDENTITY_TOOLKIT_API_HAS_NOT_BEEN_USED:
    'The Identity Toolkit API is not enabled for this project. Google Cloud console → APIs & Services → \n' +
    '   Library → "Identity Toolkit API" → Enable.',
  PROJECT_NOT_FOUND:
    'The key does not belong to this project. Re-copy apiKey and projectId from the SAME Firebase app.',
  UNAUTHORIZED_DOMAIN:
    'The action link domain is not authorised. Firebase console → Authentication → Settings → \n' +
    '   Authorized domains.',
};

async function main() {
  const target = process.argv[2];
  if (!target || !target.includes('@')) {
    console.error(
      `\nUsage: ${bold('node scripts/check-firebase-email.mjs you@example.com')}\n\n` +
        'Pass an address that is REGISTERED in this Firebase project — the test sends it a real\n' +
        'password reset email.\n',
    );
    process.exit(1);
  }

  const env = readEnv();
  const extra = readAppJsonFirebase();
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY || extra.apiKey;
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra.projectId;
  const authDomain = env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extra.authDomain;

  console.log(`\n${bold('Firebase email self-test')}`);
  console.log(`  project    ${projectId ?? red('(missing)')}`);
  console.log(`  authDomain ${authDomain ?? red('(missing)')}`);
  console.log(`  apiKey     ${apiKey ? `${apiKey.slice(0, 12)}…${apiKey.slice(-4)}` : red('(missing)')}`);
  console.log(`  recipient  ${target}\n`);

  if (!apiKey) {
    console.error(red('No API key found in .env or app.json → expo.extra.firebase. Nothing to test.'));
    process.exit(1);
  }
  if (apiKey.includes(':')) {
    console.error(red('That apiKey contains ":" — you have pasted the appId. Copy the real apiKey.'));
    process.exit(1);
  }

  // --- Probe 1: is the key itself usable? -----------------------------------
  // A deliberately malformed address sent to sendOobCode: the request can only
  // be rejected, so no account is created and no mail can reach anybody.
  //
  // The verdict is decided by EXCLUSION, not by an allowlist of expected
  // rejections. Google validates the key before it validates the body, so ANY
  // body-level complaint (INVALID_EMAIL, MISSING_PASSWORD, MISSING_REQ_TYPE, …)
  // already proves the key was accepted. Only the codes in KEY_ERRORS — or a
  // 403 — actually mean the key or its restrictions are at fault.
  console.log(bold('1. API key check'));
  const probe = await post(
    'accounts:sendOobCode',
    { requestType: 'PASSWORD_RESET', email: 'not-an-email' },
    apiKey,
  );
  const probeCode = serverCodeOf(probe);
  const KEY_ERRORS = new Set([
    'API_KEY_INVALID',
    'API_KEY_ANDROID_APP_BLOCKED',
    'API_KEY_IOS_APP_BLOCKED',
    'API_KEY_HTTP_REFERRER_BLOCKED',
    'API_KEY_SERVICE_BLOCKED',
    'PERMISSION_DENIED',
    'IDENTITY_TOOLKIT_API_HAS_NOT_BEEN_USED',
    'SERVICE_DISABLED',
    'PROJECT_NOT_FOUND',
  ]);
  const keyIsBad =
    probe.status === 403 ||
    probe.status === 401 ||
    KEY_ERRORS.has(probeCode) ||
    /API key not valid|API_KEY|has not been used in project|is disabled/i.test(
      probe.json?.error?.message ?? '',
    );

  if (keyIsBad) {
    console.log(`   ${red('PROBLEM')} — HTTP ${probe.status} ${probeCode ?? ''}`);
    console.log(dim(`   ${probe.json?.error?.message ?? probe.text.slice(0, 400)}`));
    if (ADVICE[probeCode]) console.log(`\n   ${yellow('Fix:')} ${ADVICE[probeCode]}`);
    console.log('\n   The key is the problem — the emails cannot work until this passes.\n');
    process.exit(2);
  }

  console.log(
    `   ${green('OK')} — Google accepted the key` +
      (probeCode ? dim(` (rejected the dummy request with ${probeCode}, as expected)`) : '') +
      '\n',
  );

  // --- Probe 2: actually ask for the password reset email -------------------
  console.log(bold('2. Password reset email'));
  const send = await post('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: target }, apiKey);
  const sendCode = serverCodeOf(send);

  if (send.ok) {
    console.log(`   ${green('ACCEPTED')} — HTTP ${send.status}. Firebase queued the email.`);
    console.log(dim(`   ${JSON.stringify(send.json)}`));
    console.log(
      `\n   ${yellow('If nothing arrives, the send is fine and delivery is the issue:')}\n` +
        `   • Check the SPAM / Promotions folder for noreply@${authDomain ?? 'your-project.firebaseapp.com'}\n` +
        '   • Email enumeration protection (on by default) makes Firebase return this same success\n' +
        `     for an address that has NO account — confirm ${target} is really registered under\n` +
        `     Firebase console → Authentication → Users\n` +
        '   • Corporate/university mail servers silently drop firebaseapp.com mail; try a Gmail address\n',
    );
    process.exit(0);
  }

  console.log(`   ${red('REFUSED')} — HTTP ${send.status} ${sendCode ?? ''}`);
  console.log(dim(`   ${send.json?.error?.message ?? send.text.slice(0, 400)}`));
  if (ADVICE[sendCode]) console.log(`\n   ${yellow('Fix:')} ${ADVICE[sendCode]}`);
  else console.log(`\n   ${yellow('No canned advice for this code — search it in the Firebase docs.')}`);
  console.log('');
  process.exit(2);
}

main().catch((e) => {
  console.error(red(`\nUnexpected failure: ${e?.message ?? e}\n`));
  process.exit(1);
});
