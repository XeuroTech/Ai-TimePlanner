# Google Drive Backup — Setup

The **Backup & Sync** row on the Profile screen saves the user's data as a single
JSON file inside **their own Google Drive**, in a normal, visible folder called
**Smart Planner Backups**. Nothing is stored on our servers, and the app cannot
see any of the user's other Drive files.

> **Changed from the original design.** Backups used to go into Drive's hidden
> per-app folder (`appDataFolder`). It worked, but the file was invisible in
> every Drive client — it only showed under *Settings → Manage apps* — so a
> working backup looked identical to a broken one. The visible folder costs one
> scope change (`drive.appdata` → `drive.file`, both non-sensitive) and nothing
> else. Old hidden backups are migrated automatically the first time an upgraded
> build opens the Backup screen; see *Migration* at the bottom.

The code is already in place. What is missing in a fresh clone is one thing: an
**OAuth client ID**. Until you add it, the Backup screen shows an orange warning
banner and the Connect button explains what is missing.

---

## 1. What you need to know first

| | |
|---|---|
| Google Cloud / Firebase project | **time-planner-e1e56** (project number `787221695113`) |
| Scope used | `https://www.googleapis.com/auth/drive.file` (+ `drive.appdata` to migrate old backups, + `userinfo.email` to show the account) |
| Google verification needed? | **No.** `drive.file` and `drive.appdata` are both *non-sensitive* scopes, so no OAuth review / no security assessment. |
| Works in Expo Go? | **No.** The flow needs a custom URL scheme, which only exists in a dev build or an EAS build. |
| Package name | `com.TimePlanner.company` |
| OAuth client type to create | **iOS** — used on Android too. See step 4, it is not a typo. |
| OAuth redirect URI | `com.googleusercontent.apps.<your-client-id>:/oauthredirect` (derived automatically from the client ID — see step 6) |

---

## 2. Enable the Drive API

1. Open <https://console.cloud.google.com/> and select the project that backs
   the Firebase app — **time-planner-e1e56**.
   (Firebase projects appear in Google Cloud Console automatically. Using the
   same project keeps everything in one place.)
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

> If you see an old **time-planner-3feb8** project in the picker, ignore it. That
> was an earlier throwaway project; the app now points at `time-planner-e1e56`
> everywhere (`google-services.json`, `app.json` → `extra.firebase`, `.env`).

---

## 3. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen**

1. User type: **External**.
2. App name: `Smart Planner`, support e-mail: your address, developer contact:
   your address.
3. **Scopes** → *Add or remove scopes* → paste
   `https://www.googleapis.com/auth/drive.file` and
   `https://www.googleapis.com/auth/drive.appdata` → also tick
   `.../auth/userinfo.email` → Update.

   `drive.file` is the one that matters. `drive.appdata` is only there so an
   upgraded build can still read a backup written by an older one; it can be
   dropped once no installs predate the visible folder.
4. **Test users**: while the app is in *Testing*, only e-mail addresses listed
   here can sign in. Add your own Google account. Later, press **Publish app** —
   because both scopes are non-sensitive, publishing does **not** trigger a
   Google review.

---

## 4. Create the OAuth client — type **iOS**, even for Android

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **iOS**
- Name: `Smart Planner`
- Bundle ID: `com.TimePlanner.company`

Copy the resulting client ID — it looks like
`787221695113-abcdefghijklmnop.apps.googleusercontent.com`.

That is the whole step. An iOS-type client has **no SHA-1 field and no client
secret**, so there is nothing else to fill in.

### Why an *iOS* client and not an *Android* one

This looks wrong and is worth spelling out, because the obvious choice does not
work here.

The app signs in through a **browser redirect** (`expo-auth-session` +
`AuthRequest`), so Google has to bounce back into the app through a custom URL
scheme. Which scheme is legal depends on the client type:

| Client type | Redirect scheme Google accepts | Usable here? |
|---|---|---|
| **iOS** | the *reversed client ID* — `com.googleusercontent.apps.<id>` | ✅ yes |
| **Android** | historically the package name — `com.TimePlanner.company` | ❌ no, twice over |
| **Web** | `https://…` only, and needs a client secret | ❌ no |

The Android client fails for two independent reasons:

1. Google's own OAuth docs now state that **"Custom URI schemes are no longer
   supported on Android and Chrome apps"** — the browser-redirect flow is
   deprecated for Android clients in favour of native Google Sign-In. Expo's
   built-in `expo-auth-session/providers/google` still emits
   `${applicationId}:/oauthredirect`, but the reversed-client-ID alternative is
   commented out in its source, and Android-client custom-scheme requests are
   increasingly rejected with `redirect_uri_mismatch`.
2. Even if it worked, `com.TimePlanner.company` contains **capital letters**, and
   Expo's config schema restricts `expo.scheme` to `^[a-z][a-z0-9+.-]*$`. The
   scheme literally cannot be registered in `app.json`, and a lowercased version
   would no longer match what Google has on file.

The reversed client ID is lowercase by construction and belongs to the iOS client
type, which still supports custom schemes. Google does not check *which* OS
actually performs the flow, so the iOS client works on Android. `google-drive.ts`
derives the scheme from the client ID automatically (`reversedClientScheme()`),
so there is no second value to keep in sync.

> **If this ever stops working.** Google could tighten custom-scheme rules for
> iOS clients too. The durable alternative is to drop the browser flow and use
> `@react-native-google-signin/google-signin`, which authenticates natively
> (package name + SHA-1, no redirect scheme at all) and hands you an access token
> for the same `drive.file` scope. That replaces `connect()`, `disconnect()`
> and `accessToken()` in `lib/services/google-drive.ts`; everything from
> `driveFetch()` down stays as-is.

### (Optional) A second client for iOS builds

The same client covers a real iOS build, since the bundle ID matches. Note that
`app.json` currently has no `ios.bundleIdentifier` — set it to
`com.TimePlanner.company` before you build for iOS so it matches what you
registered here.

### Where SHA-1 *is* still needed

Not for Drive backup. You need the debug/release SHA-1 in **Firebase → Project
settings → Your apps → Android** only if you later add Firebase Google Sign-In or
native Google Sign-In. Right now `google-services.json` has
`"oauth_client": []`, which is fine for Drive backup and expected.

```bash
# Debug builds (npx expo run:android) — the debug keystore in the repo
keytool -list -v -keystore android/app/debug.keystore \
        -alias androiddebugkey -storepass android -keypass android

# EAS builds — the key EAS manages for you
eas credentials            # choose Android → your profile → view keystore
```

---

## 5. Put the client ID into the app

The client ID goes into the **Android** slot as well, because that is the slot
`google-drive.ts` reads when `Platform.OS === 'android'`.

**Option A — local `.env`** (not committed). These three lines are currently
missing from `.env` entirely:

```env
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=787221695113-xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=787221695113-xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

Yes — the *same* iOS client ID in both slots. Then push them to EAS so cloud
builds get them too:

```bash
eas env:push .env
```

**Option B — `app.json`** (committed, so every EAS build has it):

```json
"extra": {
  "google": {
    "androidClientId": "787221695113-xxxx.apps.googleusercontent.com",
    "iosClientId": "787221695113-xxxx.apps.googleusercontent.com",
    "webClientId": ""
  }
}
```

Env vars win over `app.json` when both are present. These IDs are **not
secrets** — a native OAuth client has no client secret, and PKCE is what
actually protects the exchange.

---

## 6. Register the redirect scheme (the step people forget)

Google redirects back into the app through a custom URL scheme, and that scheme
has to be baked into the native build. `app.json` takes an **array**, and today
it only has the app's own scheme:

```json
"scheme": ["aitimetableplanner"]
```

Add your **reversed client ID** as a second entry: take the client ID from step
4, drop the trailing `.apps.googleusercontent.com`, and prefix
`com.googleusercontent.apps.`

```
787221695113-xxxx.apps.googleusercontent.com      ← client ID
com.googleusercontent.apps.787221695113-xxxx      ← scheme to add
```

```json
"scheme": ["aitimetableplanner", "com.googleusercontent.apps.787221695113-xxxx"]
```

Because `app.json` changed, rebuild — the Android intent filter lives in the
native project:

```bash
npx expo prebuild --clean
npx expo run:android
```

If you skip this step the Backup screen tells you the exact string to add, and
refuses to open the browser rather than letting Google fail with
`redirect_uri_mismatch` after you have already picked an account
(`driveConfigError()` in `lib/services/google-drive.ts`).

---

## 7. Try it

1. `npx expo run:android` (a dev build — **not** Expo Go).
2. Sign in to Smart Planner, add a class and a task so there is something to back up.
3. **Profile → Backup & Sync → Connect Google Drive** → pick your account →
   Allow.
4. **Back up now.** The row should show *Last backup: Just now*.
5. **Check it is really there.** Tap *View in Google Drive*, or open
   <https://drive.google.com> → **My Drive → Smart Planner Backups** →
   `smart-planner-backup.json`. The file is plain, pretty-printed JSON, so it can
   be opened and read.
6. To prove the round trip: delete a task, then **Restore from cloud** — it comes
   back.

---

## What actually gets backed up

| Source | Data |
|---|---|
| AsyncStorage (zustand) | timetable classes, tasks, daily-plan items, habits + the full per-day habit log, notification inbox, dark-mode and notification switches |
| SQLite | profile (name, category, preferences, premium flag) and all AI Assistant conversations |

Never backed up: passwords, the Firebase session, and the Google OAuth tokens
themselves.

One file, `smart-planner-backup.json`, is kept in **My Drive → Smart Planner
Backups** and overwritten each time — a planner has no use for duplicate history,
and the file counts against the user's Drive quota.

The folder is created on the first upload. If the user deletes it, the next
backup simply makes it again. Under `drive.file` the app can only ever list files
it created itself, so the lookup cannot latch onto an unrelated folder of the
user's with the same name.

### Restore semantics

Restore **replaces** the signed-in user's data on this device and leaves other
accounts on the same device alone. Rows are re-stamped with the current user's
`uid`, so a backup made on account A restores visibly onto account B.

### Migration from the hidden folder

`migrateLegacyBackup()` runs whenever the Backup screen refreshes its cloud info.
If there is no file in the visible folder but there *is* one in `appDataFolder`,
it downloads the old one, re-uploads it to **Smart Planner Backups**, and deletes
the hidden original. Files cannot be re-parented out of `appDataFolder`, which is
why it is a copy rather than a move. Every failure in that path is swallowed — a
fresh install has nothing to migrate, and a user whose grant no longer covers
`drive.appdata` must not be told their healthy backup is broken.

Users who connected under the old build hold a token scoped to `drive.appdata`
only. That token would be accepted by Google and then rejected on every write
outside the hidden folder, so `getConnection()` checks the granted scope and
reports them as disconnected with an explanation, rather than letting a backup
fail with an opaque 403.

### Auto backup

The toggle on the Backup screen watches the planner and habits stores and uploads
**20 seconds after the last edit**, at most **once every 5 minutes**, plus once
when the app goes to the background. See `hooks/use-auto-backup.ts`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Banner says *Google Drive backup is not set up yet: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is missing* | Step 5. The variable is absent from `.env` **and** `expo.extra.google.androidClientId` is `""`. This is the default state of a fresh clone — backup cannot start at all. |
| Screen says *Add "com.googleusercontent.apps.…" to "scheme"* | Step 6 is missing, or you added it but haven't rebuilt yet. |
| `Error 400: redirect_uri_mismatch` | Either the reversed-client-ID scheme in `app.json` doesn't match the client ID in use, or you created an **Android**-type client instead of an iOS one (see step 4). Fix and re-run `npx expo prebuild --clean`. |
| `Error 400: invalid_request` mentioning *custom scheme* | Same cause: an Android-type client. Google no longer accepts custom-scheme redirects for that client type. Create the iOS client. |
| `Error 403: access_denied` | The Google account isn't in **Test users** and the consent screen is still in *Testing*. |
| "needs a development build" | You are in Expo Go. Use `npx expo run:android` or an EAS build. |
| Sign-in works, backup fails 403 | The Drive API is not enabled on `time-planner-e1e56` (step 2). |
| Asked to sign in again after a few days | Normal only if the user revoked access at <https://myaccount.google.com/permissions>; otherwise the stored refresh token keeps it silent. |
| Backup succeeds but the file is nowhere in Drive | Expected on builds before the visible folder: the file was in the hidden `appDataFolder`, which only appears under drive.google.com → *Settings → Manage apps*. Open the Backup screen once on the new build and it is migrated to **My Drive → Smart Planner Backups**. |
| *Please connect your Google account once more…* right after updating | The stored grant predates `drive.file`. One reconnect fixes it permanently. |
| The file is in Drive but *View in Google Drive* is missing | `webViewLink` only arrives with fresh file metadata — press *Check cloud backup* once. |
| Everything configured, still nothing | Confirm the client ID actually reaches the bundle: `EXPO_PUBLIC_*` vars are inlined at **build** time, so a `.env` edit needs a Metro restart with `--clear`, and an EAS build needs `eas env:push .env`. |
