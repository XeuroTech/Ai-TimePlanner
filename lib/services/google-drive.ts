/**
 * Google Drive backup transport — OAuth 2.0 + the Drive v3 REST API.
 *
 * ---------------------------------------------------------------------------
 * WHY A VISIBLE "Smart Planner Backups" FOLDER (AND NOT appDataFolder)
 * ---------------------------------------------------------------------------
 * Backups are written to an ordinary folder in the user's My Drive, so the file
 * behaves like any other document: it appears in Drive on web and mobile, in
 * search, and can be opened, downloaded or kept as a manual copy.
 *
 * This replaces the original `appDataFolder` design. That folder is invisible in
 * every Drive client (it only surfaces under Settings → Manage apps), which made
 * a successful backup indistinguishable from a broken one. The feature exists to
 * be reassuring, so it has to be *visible*.
 *
 * The cost is one scope change, and it is a cheap one:
 *
 *   - `https://www.googleapis.com/auth/drive.file` is, like `drive.appdata`,
 *     a **non-sensitive** scope: no Google verification review is required.
 *   - It grants access *only to files this app created* (or that the user
 *     explicitly opened with it). The app still cannot read the user's other
 *     documents, so the privacy promise on the Backup screen survives intact.
 *
 * `drive.appdata` is still requested, for one reason only: reading the backup
 * that older builds left in the hidden folder so upgrading users don't lose it.
 * See `migrateLegacyBackup` at the bottom of this file.
 *
 * ---------------------------------------------------------------------------
 * WHY expo-auth-session IS DRIVEN IMPERATIVELY (no `providers/google`)
 * ---------------------------------------------------------------------------
 * `expo-auth-session/providers/google` is deprecated in SDK 54 and, more
 * importantly, never asks Google for `access_type=offline`, so it comes back
 * without a refresh token — every backup would re-open the browser. We build
 * the `AuthRequest` here instead so we control `access_type` / `prompt` and can
 * refresh silently forever.
 *
 * `AuthRequest#promptAsync` is a plain async method (no React hook), so this
 * whole module stays outside the component tree.
 *
 * ---------------------------------------------------------------------------
 * REQUIREMENTS (see GOOGLE_DRIVE_BACKUP_SETUP.md)
 * ---------------------------------------------------------------------------
 * - A **development / EAS build**. The custom-scheme redirect below does not
 *   exist in Expo Go, so Google rejects the flow there.
 * - An OAuth client of type *Android* (and/or *iOS*) in Google Cloud Console,
 *   registered against the app's package name + signing SHA-1.
 * - `expo.scheme` in app.json must include the application id, because the
 *   redirect is `<application-id>:/oauthredirect`.
 */

import {
  AuthRequest,
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
  ResponseType,
  revokeAsync,
  TokenResponse,
} from 'expo-auth-session';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { readJSON, remove as removeKey, writeJSON } from '@/lib/storage';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Files this app creates — enough to write the backup into a visible folder. */
const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Only to read backups written by pre-visible-folder builds. */
const LEGACY_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Only what we need: our own files, the old hidden folder, and the address. */
export const DRIVE_SCOPES = [
  FILE_SCOPE,
  LEGACY_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Hardcoded rather than fetched: Google's endpoints are stable, and a network
 *  round-trip to the discovery document before every sign-in is wasted time. */
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Name of the single backup document. */
export const BACKUP_FILE_NAME = 'smart-planner-backup.json';

/** Folder created in the user's My Drive to hold it. */
export const BACKUP_FOLDER_NAME = 'Smart Planner Backups';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Cached id of the backup folder. Drive ids never change, so looking it up
 * before every upload is a wasted round trip. Cleared with the tokens (see
 * `clearTokens`) because the next account will have a different folder.
 */
let cachedFolderId: string | null = null;

const TOKENS_KEY = '@aip/googleDriveTokens';

/** Refresh this many seconds before the token actually dies, so a slow upload
 *  can't start with a valid token and finish with an expired one. */
const EXPIRY_SKEW_SECONDS = 120;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type DriveErrorCode =
  | 'not-configured'
  | 'not-connected'
  | 'cancelled'
  | 'auth-failed'
  | 'network'
  | 'drive';

export class DriveError extends Error {
  code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
  }
}

/** Turns anything thrown in here into a sentence that can go straight in a toast. */
export function driveErrorMessage(e: unknown): string {
  if (e instanceof DriveError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong talking to Google Drive.';
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

type GoogleClientConfig = {
  androidClientId?: string;
  iosClientId?: string;
  webClientId?: string;
};

/** `expo.extra.google` from app.json — committed, so EAS builds work without .env. */
function extraGoogle(): GoogleClientConfig {
  const extra = Constants.expoConfig?.extra as { google?: GoogleClientConfig } | undefined;
  return extra?.google ?? {};
}

/** Treat empty strings as missing so a blank EAS variable can't win. */
function pick(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => !!v && v.length > 0);
}

/**
 * The OAuth client for the current platform.
 *
 * Android and iOS need their *own* native client (Google ties each to a package
 * name / bundle id), which is why this is not one shared value. The web client
 * is only a fallback so `expo start --web` doesn't hard-crash.
 */
function clientId(): string | undefined {
  const e = extraGoogle();
  if (Platform.OS === 'android') {
    return pick(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, e.androidClientId);
  }
  if (Platform.OS === 'ios') {
    return pick(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, e.iosClientId);
  }
  return pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, e.webClientId);
}

/**
 * The custom URL scheme Google will redirect back to.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REVERSED CLIENT ID AND NOT THE PACKAGE NAME
 * ---------------------------------------------------------------------------
 * Google accepts two redirect styles for a native OAuth client: the package
 * name (`com.TimePlanner.company:/oauthredirect`) or the *reversed client id*
 * (`com.googleusercontent.apps.<id>:/oauthredirect`).
 *
 * The package name is unusable here: this app's id contains capitals, and Expo's
 * config schema restricts `expo.scheme` to `^[a-z][a-z0-9+.-]*$`, so
 * `com.TimePlanner.company` cannot be registered as a scheme at all. Lowercasing
 * it would then no longer match what Google has on file.
 *
 * The reversed client id is always lowercase, so it is derived from the client id
 * automatically — no extra configuration to keep in sync. Set
 * `EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME` only if you deliberately want a different
 * registered redirect.
 */
function reversedClientScheme(id: string): string {
  return `com.googleusercontent.apps.${id.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

function redirectScheme(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME ?? reversedClientScheme(requireClientId());
}

function redirectUri(): string {
  return makeRedirectUri({
    // Standalone / dev-client builds get the custom scheme Google expects;
    // `makeRedirectUri` falls back to an `exp://` URL inside Expo Go, which is
    // caught explicitly in `connect()`.
    native: `${redirectScheme()}:/oauthredirect`,
    path: 'oauthredirect',
  });
}

/** Every scheme this build actually registered, from `expo.scheme` in app.json. */
function appSchemes(): string[] {
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) return scheme;
  return scheme ? [scheme] : [];
}

/** True when a client id is present, i.e. the feature can even be attempted. */
export function isDriveConfigured(): boolean {
  return !!clientId();
}

/** The env var whose absence explains a missing client id on this platform. */
function clientIdVarName(): string {
  if (Platform.OS === 'ios') return 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID';
  if (Platform.OS === 'android') return 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
  return 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
}

/**
 * Human-readable reason Drive backup can't work in this build (null when fine).
 *
 * Checks the scheme as well as the client id: a missing scheme otherwise
 * surfaces as Google's opaque `Error 400: redirect_uri_mismatch` *after* the
 * user has already picked an account, which is a miserable way to find out.
 */
export function driveConfigError(): string | null {
  const id = clientId();
  if (!id) {
    return (
      `Google Drive backup is not set up yet: ${clientIdVarName()} is missing. ` +
      'Create an OAuth client in Google Cloud Console and add it to .env or ' +
      '`expo.extra.google` in app.json — see GOOGLE_DRIVE_BACKUP_SETUP.md.'
    );
  }

  // Web redirects to an https URL, not a custom scheme — nothing to register.
  if (Platform.OS === 'web') return null;

  const scheme = redirectScheme();
  if (!appSchemes().some((s) => s.toLowerCase() === scheme.toLowerCase())) {
    return (
      `Add "${scheme}" to "scheme" in app.json, then rebuild the app ` +
      '(`npx expo prebuild --clean && npx expo run:android`). Google redirects ' +
      'back to that scheme after sign-in, and this build does not register it.'
    );
  }
  return null;
}

function requireClientId(): string {
  const id = clientId();
  if (!id) {
    throw new DriveError(
      'not-configured',
      `Google Drive backup is not set up yet: ${clientIdVarName()} is missing. ` +
        'See GOOGLE_DRIVE_BACKUP_SETUP.md.',
    );
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Token storage                                                              */
/* -------------------------------------------------------------------------- */

type StoredTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch **seconds** at which `accessToken` stops working. */
  expiresAt?: number;
  scope?: string;
  email?: string;
};

/**
 * NOTE ON STORAGE: this lives in AsyncStorage, which is app-private but not
 * hardware-encrypted. The only thing the token can reach is this app's own
 * hidden Drive folder (see the `drive.appdata` note at the top), so the blast
 * radius is one backup file. If you later add `expo-secure-store`, this is the
 * single function pair to swap.
 */
async function loadTokens(): Promise<StoredTokens | null> {
  return readJSON<StoredTokens | null>(TOKENS_KEY, null);
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await writeJSON(TOKENS_KEY, tokens);
}

async function clearTokens(): Promise<void> {
  await removeKey(TOKENS_KEY);
  // The next account gets its own folder, so a remembered id would 404.
  cachedFolderId = null;
}

/** Epoch seconds at which a token response stops being usable (undefined = never). */
function expiryFrom(res: TokenResponse): number | undefined {
  if (!res.expiresIn) return undefined;
  return Math.floor(res.issuedAt + res.expiresIn);
}

/* -------------------------------------------------------------------------- */
/* Connection state                                                          */
/* -------------------------------------------------------------------------- */

export type DriveConnection = {
  connected: boolean;
  email?: string;
  /**
   * True when a token is stored but was granted before `drive.file` was
   * requested. The account is "known" but unusable until the user consents
   * again, and the UI says so rather than waiting for a backup to fail.
   */
  needsReconnect?: boolean;
};

/**
 * Whether a stored grant covers writing to a normal Drive folder.
 *
 * Tokens issued by builds that only asked for `drive.appdata` are still valid —
 * Drive would happily accept them and then reject every write outside the hidden
 * folder with a 403. Checking the scope up front turns that into one clear
 * "please connect again" instead.
 */
function hasFileScope(tokens: StoredTokens): boolean {
  return !!tokens.scope && tokens.scope.split(' ').includes(FILE_SCOPE);
}

/** Shown wherever a stale grant is discovered, so the reason is never a mystery. */
export const RECONNECT_MESSAGE =
  'Backups now go into a "Smart Planner Backups" folder you can see in Google ' +
  'Drive. Please connect your Google account once more to allow that.';

export async function getConnection(): Promise<DriveConnection> {
  const tokens = await loadTokens();
  if (!tokens) return { connected: false };
  if (!hasFileScope(tokens)) {
    return { connected: false, email: tokens.email, needsReconnect: true };
  }
  return { connected: true, email: tokens.email };
}

/* -------------------------------------------------------------------------- */
/* Sign-in / sign-out                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Opens Google's consent screen and stores the resulting tokens.
 *
 * `access_type=offline` + `prompt=consent` is what makes Google hand back a
 * refresh token. Without `prompt=consent` a *returning* user who already
 * granted access gets an access token only, and every later backup would have
 * to re-open the browser — so the slightly noisier consent screen is a
 * deliberate trade.
 */
export async function connect(): Promise<DriveConnection> {
  const id = requireClientId();
  const uri = redirectUri();

  if (uri.startsWith('exp://') || uri.startsWith('exps://')) {
    throw new DriveError(
      'auth-failed',
      'Google sign-in needs a development build — it cannot run inside Expo Go. ' +
        'Run `npx expo run:android` (or an EAS build) and try again.',
    );
  }

  // Fail before opening the browser rather than after account selection.
  const setupError = driveConfigError();
  if (setupError) throw new DriveError('not-configured', setupError);

  const request = new AuthRequest({
    clientId: id,
    redirectUri: uri,
    scopes: DRIVE_SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  });

  const result = await request.promptAsync(DISCOVERY);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new DriveError('cancelled', 'Google sign-in was cancelled.');
  }
  if (result.type === 'error') {
    throw new DriveError('auth-failed', result.error?.message ?? 'Google sign-in failed.');
  }
  if (result.type !== 'success') {
    // 'locked' (another session already open) or the unreachable 'opened'.
    throw new DriveError('auth-failed', `Google sign-in did not complete (${result.type}).`);
  }

  const code = result.params.code;
  if (!code) throw new DriveError('auth-failed', 'Google did not return an authorization code.');

  let token: TokenResponse;
  try {
    token = await exchangeCodeAsync(
      {
        clientId: id,
        code,
        redirectUri: uri,
        scopes: DRIVE_SCOPES,
        // Native clients are public: no secret, PKCE proves the exchange instead.
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      DISCOVERY,
    );
  } catch (e) {
    throw new DriveError('auth-failed', `Could not complete Google sign-in. ${asMessage(e)}`);
  }

  const email = await fetchEmail(token.accessToken);
  const tokens: StoredTokens = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: expiryFrom(token),
    scope: token.scope,
    ...(email ? { email } : {}),
  };
  await saveTokens(tokens);
  return { connected: true, email };
}

/** Forgets the account locally and revokes the grant on Google's side. */
export async function disconnect(): Promise<void> {
  const tokens = await loadTokens();
  // Clear locally FIRST: if revocation fails (offline, already-revoked token)
  // the user must still end up disconnected, not stuck "connected".
  await clearTokens();
  if (!tokens) return;
  try {
    await revokeAsync(
      { clientId: requireClientId(), token: tokens.refreshToken ?? tokens.accessToken },
      DISCOVERY,
    );
  } catch {
    // Best effort — the local grant is already gone.
  }
}

async function fetchEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { email?: string };
    return json.email;
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Access tokens                                                              */
/* -------------------------------------------------------------------------- */

/** A valid access token, refreshing silently when the stored one has aged out. */
async function accessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new DriveError('not-connected', 'Connect a Google account first.');
  }

  // A pre-`drive.file` grant can never write to a visible folder. Drop it here
  // rather than letting Drive answer with an unexplained 403 mid-upload.
  if (!hasFileScope(tokens)) {
    await clearTokens();
    throw new DriveError('not-connected', RECONNECT_MESSAGE);
  }

  const now = Math.floor(Date.now() / 1000);
  const stillFresh = !tokens.expiresAt || tokens.expiresAt - EXPIRY_SKEW_SECONDS > now;
  if (stillFresh) return tokens.accessToken;

  if (!tokens.refreshToken) {
    await clearTokens();
    throw new DriveError(
      'not-connected',
      'Your Google session expired. Please connect your Google account again.',
    );
  }

  try {
    const refreshed = await refreshAsync(
      { clientId: requireClientId(), refreshToken: tokens.refreshToken, scopes: DRIVE_SCOPES },
      DISCOVERY,
    );
    // Google omits `refresh_token` on refresh responses — keep the original.
    await saveTokens({
      ...tokens,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      expiresAt: expiryFrom(refreshed),
    });
    return refreshed.accessToken;
  } catch (e) {
    // A rejected refresh token is dead for good (revoked, or the user removed
    // the app's access). Drop it so the UI asks for a fresh sign-in.
    await clearTokens();
    throw new DriveError(
      'not-connected',
      `Your Google session is no longer valid — please connect again. ${asMessage(e)}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Drive REST                                                                 */
/* -------------------------------------------------------------------------- */

export type DriveFile = {
  id: string;
  name: string;
  /** RFC 3339 timestamp from Drive. */
  modifiedTime?: string;
  /** Bytes, as a string in the Drive API. */
  size?: string;
  /** Opens the file in the Drive web UI / app — powers "View in Google Drive". */
  webViewLink?: string;
};

/** Everything the UI wants back about a stored file, in one round trip. */
const FILE_FIELDS = 'id,name,modifiedTime,size,webViewLink';

type DriveRequest = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
};

async function driveFetch(url: string, init?: DriveRequest): Promise<Response> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      ...(init?.body !== undefined ? { body: init.body } : {}),
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new DriveError('network', `No connection to Google Drive. ${asMessage(e)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new DriveError(
        'not-connected',
        'Google Drive rejected the request. Please connect your Google account again.',
      );
    }
    throw new DriveError('drive', `Google Drive error ${res.status}. ${extractDriveMessage(body)}`);
  }
  return res;
}

/** Pulls `error.message` out of a Drive JSON error, falling back to raw text. */
function extractDriveMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    return json.error?.message ?? '';
  } catch {
    return body.slice(0, 200);
  }
}

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* -------------------------------------------------------------------------- */
/* The backup folder                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Drive's `q` syntax has no parameter binding — a `'` in a name would end the
 * literal early. Our names are constants, but escaping keeps that true if they
 * are ever made configurable.
 */
function quoteForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(): Promise<string | null> {
  const params = new URLSearchParams({
    q:
      `name = '${quoteForQuery(BACKUP_FOLDER_NAME)}' and ` +
      `mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id)',
    // Oldest first: if a folder somehow got duplicated, keep using the original.
    orderBy: 'createdTime',
    pageSize: '1',
  });
  const res = await driveFetch(`${DRIVE_FILES}?${params.toString()}`);
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/**
 * Id of the backup folder. With `create`, makes it when it isn't there — which
 * is also what happens if the user deletes it, so "Back up now" always works.
 *
 * Under `drive.file` a list query only ever returns files this app created, so
 * this cannot accidentally latch onto some unrelated folder of the user's that
 * happens to share the name.
 */
async function folderId(create: false): Promise<string | null>;
async function folderId(create: true): Promise<string>;
async function folderId(create: boolean): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;

  const existing = await findFolder();
  if (existing) {
    cachedFolderId = existing;
    return existing;
  }
  if (!create) return null;

  const res = await driveFetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  const json = (await res.json()) as { id: string };
  cachedFolderId = json.id;
  return json.id;
}

/* -------------------------------------------------------------------------- */
/* Read / write                                                               */
/* -------------------------------------------------------------------------- */

/** The existing backup document in My Drive, or null on a first run. */
export async function findBackupFile(): Promise<DriveFile | null> {
  const parent = await folderId(false);
  const filters = [`name = '${quoteForQuery(BACKUP_FILE_NAME)}'`, 'trashed = false'];
  // Before the folder exists there is nothing to scope to — and `drive.file`
  // keeps even an unscoped query limited to this app's own files.
  if (parent) filters.push(`'${parent}' in parents`);

  const params = new URLSearchParams({
    q: filters.join(' and '),
    fields: `files(${FILE_FIELDS})`,
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const res = await driveFetch(`${DRIVE_FILES}?${params.toString()}`);
  const json = (await res.json()) as { files?: DriveFile[] };
  return json.files?.[0] ?? null;
}

/**
 * Writes `contents` to the backup document, creating it on first use and
 * overwriting it afterwards.
 *
 * Overwrite (rather than append-a-new-file) is deliberate: the file counts
 * against the user's Drive quota, and a planner backup has no value in
 * duplicate. History, if ever wanted, belongs behind an explicit "keep N
 * versions" setting.
 */
export async function uploadBackup(contents: string): Promise<DriveFile> {
  const existing = await findBackupFile();

  if (existing) {
    const res = await driveFetch(
      `${DRIVE_UPLOAD}/${existing.id}?uploadType=media&fields=${FILE_FIELDS}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: contents,
      },
    );
    return (await res.json()) as DriveFile;
  }

  const parent = await folderId(true);

  // Multipart create: metadata part (which folder / what name) + content part.
  const boundary = `aip-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: BACKUP_FILE_NAME, parents: [parent] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${contents}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const created = (await res.json()) as DriveFile;

  // The visible copy is now authoritative — drop the hidden one so a later
  // restore can't quietly pick up a stale backup.
  await deleteLegacyBackup();
  return created;
}

/** Raw JSON text of the stored backup, or null when there is none. */
export async function downloadBackup(): Promise<string | null> {
  const file = (await findBackupFile()) ?? (await findLegacyBackupFile());
  if (!file) return null;
  const res = await driveFetch(`${DRIVE_FILES}/${file.id}?alt=media`);
  return res.text();
}

/** Deletes the backup document (used by "Delete cloud backup"). */
export async function deleteBackup(): Promise<boolean> {
  const file = await findBackupFile();
  const legacyDeleted = await deleteLegacyBackup();
  if (!file) return legacyDeleted;
  await driveFetch(`${DRIVE_FILES}/${file.id}`, { method: 'DELETE' });
  return true;
}

/* -------------------------------------------------------------------------- */
/* Legacy appDataFolder backups                                               */
/* -------------------------------------------------------------------------- */

/**
 * The backup left behind by a build that wrote to the hidden `appDataFolder`.
 *
 * Every failure here is swallowed: this is a best-effort rescue of old data, and
 * a user whose grant no longer covers `drive.appdata` must not be told their
 * (perfectly healthy) visible backup is broken.
 */
async function findLegacyBackupFile(): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${quoteForQuery(BACKUP_FILE_NAME)}' and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  try {
    const res = await driveFetch(`${DRIVE_FILES}?${params.toString()}`);
    const json = (await res.json()) as { files?: DriveFile[] };
    return json.files?.[0] ?? null;
  } catch {
    return null;
  }
}

async function deleteLegacyBackup(): Promise<boolean> {
  const legacy = await findLegacyBackupFile();
  if (!legacy) return false;
  try {
    await driveFetch(`${DRIVE_FILES}/${legacy.id}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time move of a hidden backup into the visible folder.
 *
 * Called when the Backup screen opens, so an upgrading user sees their existing
 * backup in Drive without having to press anything. A no-op — and silent — in
 * every other case, including a fresh install.
 *
 * The file is re-uploaded rather than re-parented: `appDataFolder` is a separate
 * space in Drive, and files cannot be moved out of it.
 */
export async function migrateLegacyBackup(): Promise<DriveFile | null> {
  try {
    if (await findBackupFile()) return null;

    const legacy = await findLegacyBackupFile();
    if (!legacy) return null;

    const contents = await (await driveFetch(`${DRIVE_FILES}/${legacy.id}?alt=media`)).text();
    // `uploadBackup` deletes the hidden original once the visible copy exists.
    return await uploadBackup(contents);
  } catch {
    return null;
  }
}
