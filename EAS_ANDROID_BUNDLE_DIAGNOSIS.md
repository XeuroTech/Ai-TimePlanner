# EAS Android — "Bundle JavaScript" failure: root-cause report

Date: 2026-07-28 · Project: `Ai-TimeTable-Planner` · Expo SDK 54 / RN 0.81.5 / expo-router 6

---

## 0. Method (read this first)

You did not provide the EAS build logs, so I did not guess. I **reproduced the
Bundle JavaScript phase locally** instead, byte-for-byte with what EAS runs.

What EAS actually executes in that phase (Gradle task
`:app:createBundleReleaseJsAndAssets`) is:

```
node node_modules/expo/node_modules/@expo/cli/build/bin/cli export:embed \
  --eager --platform android --dev false \
  --bundle-output  .../index.android.bundle \
  --sourcemap-output .../index.android.bundle.map \
  --assets-dest ...
```

Two details I confirmed from `@expo/cli` source
(`build/src/export/embed/resolveOptions.js:122`):

```js
minify ??= !(platform === 'android' ? isAndroidUsingHermes(projectRoot) : ...)
```

→ because Hermes is enabled, **EAS does not minify** the Android release bundle.
So `--dev false --minify false` is the exact production configuration.

I ran that command, plus sourcemap generation, plus `hermesc`, against **the
committed source of your repo**. Result below.

---

## 1. Root cause

**Not reproducible from your source. The Bundle JavaScript phase completes
successfully on the current commit (`ad59154`).**

Full evidence:

| Stage EAS runs | Result |
|---|---|
| Metro graph build (`export:embed --dev false --minify false --platform android`) | **PASS** — 1655 modules |
| Write `index.android.bundle` | **PASS** — 8,632,799 bytes |
| Write sourcemap | **PASS** — 14,987,313 bytes |
| `hermesc -emit-binary -O` | **PASS** — 5,261,653 bytes, warnings only |
| Same run with `.env` deleted (EAS has no `.env` — it is gitignored) | **PASS** |
| `tsc --noEmit` | **PASS** — 0 errors |
| `expo-doctor` | 16/18 pass; 2 failures are network-only (sandbox cannot reach `exp.host`) |

Therefore the failure is **not** a missing module, wrong import/export, circular
dependency, invalid TypeScript, Babel config, Metro config, Expo Router,
React Navigation, Firebase init, AsyncStorage, package version mismatch,
invalid `app.json`/`eas.json`, dynamic import, unsupported Node API, asset,
font, or SDK incompatibility. Each of those would have failed the run above.

The remaining candidates all live outside the source tree, and **the log lines
in §9 are required to pick between them**. Ranked by likelihood:

1. **The failing build is not this commit.** Your working tree is dirty (40+
   files), but `git diff -w HEAD` is **empty** — every "change" is CRLF↔LF only.
   So HEAD == working tree in content. If the failed build predates `ad59154`,
   it was building code that no longer exists.
2. **Node heap exhaustion on the EAS worker.** An 8.6 MB bundle + 15 MB
   sourcemap is large. OOM in this phase prints
   `FATAL ERROR: Ineffective mark-compacts near heap limit` and EAS reports it
   as exactly your "Unknown error." message.
3. **A dependency-install difference on the EAS image** (`npm ci` from a
   Windows-generated `package-lock.json`). I installed from your lockfile on
   Linux with no resolution errors, so this is unlikely but not excluded.

## 2. Affected file

None. No file in `app/`, `components/`, `constants/`, `hooks/`, `lib/`, or
`store/` fails to transform or resolve.

## 3. Affected line

None.

## 4. Why it failed

Cannot be stated from source. Metro did **not** stop bundling in my
reproduction — it resolved and transformed all 1655 modules and serialized
successfully with the same flags EAS uses.

## 5. Exact code fix

There is no bundling defect to fix. The changes below are real defects I found
while auditing, but **none of them break the build** — items 5.1 is a shipped
functional bug, 5.2–5.3 are hygiene.

### 5.1 — `EXPO_PUBLIC_*` variables missing on EAS (real, ships broken)

`.env` is gitignored (`.gitignore` line: `.env`), so EAS never receives it.
`eas.json` supplies only the 7 `EXPO_PUBLIC_FIREBASE_*` values. Missing:

* `EXPO_PUBLIC_GROQ_API_KEY` → `lib/services/ai.ts` sets
  `isAiConfigured = false`; **the AI Assistant screen is dead in every EAS build.**
* `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `..._IOS_CLIENT_ID`, `..._ANDROID_CLIENT_ID`
  → `lib/auth/use-social-auth.ts`; **Google sign-in is dead in every EAS build.**

**Before** — `eas.json`, `build.production`:

```json
    "production": {
      "autoIncrement": true,
      "environment": "production",
      "env": {
        "EXPO_PUBLIC_FIREBASE_API_KEY": "AIzaSyB2_ZxZHR_hEVvvGZg_7l2aEUKZUUMNKeo",
        "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN": "time-planner-3feb8.firebaseapp.com",
        "EXPO_PUBLIC_FIREBASE_PROJECT_ID": "time-planner-3feb8",
        "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET": "time-planner-3feb8.firebasestorage.app",
        "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "319532363188",
        "EXPO_PUBLIC_FIREBASE_APP_ID": "1:319532363188:web:6f6d69637427fcc370d6e1",
        "EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID": "G-LQD4YQ96D5"
      }
    }
```

**After** — stop hardcoding config in `eas.json` (the Firebase values are
already committed in `app.json` → `expo.extra.firebase`, and `lib/firebase/config.ts`
already falls back to them). Push the *real* secrets to EAS instead:

```json
    "production": {
      "autoIncrement": true,
      "environment": "production"
    }
```

then once, from the project root:

```bash
eas env:create --environment production --name EXPO_PUBLIC_GROQ_API_KEY            --value "gsk_..."         --visibility sensitive
eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID    --value "xxxx.apps.googleusercontent.com"
eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID    --value "xxxx.apps.googleusercontent.com"
eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value "xxxx.apps.googleusercontent.com"
```

Repeat for `preview` / `development`, or use `eas env:push .env --environment production`.

> Note: `EXPO_PUBLIC_*` values are inlined into the JS bundle by
> `babel-preset-expo` and are readable by anyone who unzips your APK. The Groq
> key in particular should move behind a server proxy — `lib/services/ai.ts`
> already says so in its own header comment.

### 5.2 — Delete the orphaned duplicate auth module

`lib/auth-service.ts` (132 lines) is fully superseded by
`lib/auth/auth-service.ts`. Nothing imports it (`store/auth-store.ts` imports
`@/lib/auth/auth-service`). It also stores credentials in AsyncStorage **in
plain text**, which is a liability if it is ever re-imported by mistake.

**Before:** `lib/auth-service.ts` exists and is unreferenced.
**After:** delete the file.

```bash
git rm lib/auth-service.ts
```

### 5.3 — Turn off Crashlytics debug collection for release

**Before** — `firebase.json`:

```json
{
  "react-native": {
    "crashlytics_debug_enabled": true,
    "crashlytics_auto_collection_enabled": true,
    "crashlytics_ndk_enabled": true
  }
}
```

**After:**

```json
{
  "react-native": {
    "crashlytics_debug_enabled": false,
    "crashlytics_auto_collection_enabled": true,
    "crashlytics_ndk_enabled": true
  }
}
```

`crashlytics_debug_enabled` only adds verbose native logging; leaving it on in
release builds is noise.

## 6. Other issues found

Checked for invalid imports, duplicate exports, missing files, incorrect
aliases, broken path mappings, unsupported syntax, package-resolution failures:

| Check | Result |
|---|---|
| All 54 distinct import specifiers across `app/ components/ constants/ hooks/ lib/ store/` | all resolve (simulated with `unstable_enablePackageExports = false`, then confirmed by the real bundle) |
| `@/*` alias (`tsconfig.json` → `"./*"`) | correct; matches `babel-preset-expo` + Metro `resolver` behaviour |
| Case-sensitivity (Windows dev → Linux EAS) | clean — `git ls-files` casing matches disk casing exactly; no case-duplicate index entries |
| Untracked source files (would be absent on EAS) | **none** — all 101 tracked |
| Working tree vs HEAD | content-identical (`git diff -w HEAD` empty); diff noise is CRLF only |
| Assets referenced by `app.json` | all 5 present in `assets/images/` |
| Config plugins listed in `app.json` | all 9 resolve to a real `app.plugin.js` |
| Circular dependencies | none fatal — graph built cleanly |
| `lib/auth-service.ts` | dead file (see 5.2) |
| `app.json` → `extra.router: {}` | legacy leftover, harmless, can be removed |
| Secrets committed | Firebase web keys in `app.json` **and** duplicated in `eas.json`; `google-services.json` committed. Web API keys aren't secret, but the duplication means two places to update. |

## 7. Dependency issues

**None.** `expo-doctor` → *"Check that packages match versions required by
installed Expo SDK"* ✔, *"Check that required peer dependencies are installed"* ✔,
*"Check that no duplicate dependencies are installed"* ✔, *"Check that native
modules do not use incompatible support packages"* ✔.

Verified against `node_modules/expo/bundledNativeModules.json` for SDK 54:

| Package | Installed | SDK 54 expects | |
|---|---|---|---|
| expo | 54.0.35 | — | ok |
| react | 19.1.0 | 19.1.0 | ok |
| react-dom | 19.1.0 | 19.1.0 | ok |
| react-native | 0.81.5 | 0.81.5 | ok |
| expo-router | 6.0.24 | ~6.0.24 | ok |
| react-native-reanimated | 4.1.7 | ~4.1.1 | ok |
| react-native-worklets | 0.5.1 | 0.5.1 | ok |
| react-native-screens | 4.16.x | ~4.16.0 | ok |
| react-native-safe-area-context | 5.6.x | ~5.6.0 | ok |
| react-native-gesture-handler | 2.28.x | ~2.28.0 | ok |
| @react-native-async-storage/async-storage | 2.2.0 | 2.2.0 | ok |
| metro | 0.83.3 | (RN 0.81 line) | ok |
| @babel/core | 7.29.7 | — | ok |
| babel-preset-expo | 54.0.12 | — | ok |
| babel-plugin-react-compiler | 1.0.0 | `^1.0.0` (dep of babel-preset-expo) | ok |
| typescript | 5.9.x | ~5.9.2 | ok |
| firebase (JS SDK) | 10.14.1 | n/a | ok |
| @react-native-firebase/{app,analytics,crashlytics} | 25.1.0 | n/a | ok, all three aligned |

Notes:

* **No `babel.config.js` is needed.** `babel-preset-expo@54.0.12` auto-injects
  `react-native-worklets/plugin` when `react-native-worklets` is installed
  (`build/index.js:284-291`), which is what Reanimated 4 requires. Adding a
  `babel.config.js` that also lists the plugin would double-apply it.
* **`react-compiler-runtime` is correctly absent.** It is only needed for
  React < 19; you are on 19.1.0.
* `experiments.reactCompiler: true` works — the run logs `React Compiler enabled`
  and completes. `babel-preset-expo` passes `panicThreshold: 'NONE'` in
  production, which the plugin lowercases internally
  (`parsePluginOptions`: `value = value.toLowerCase()`), so it is a no-op, not a
  config error.
* `@react-native-firebase/analytics` is pinned with `^25.1.0` while `app` and
  `crashlytics` use exact `25.1.0`. Harmless today, but pin all three to
  `25.1.0` so a minor bump can't desync them.

## 8. Configuration issues

* `metro.config.js` — `config.resolver.unstable_enablePackageExports = false`.
  **Verified working** (all 1655 modules resolve). Keep it if you need it for
  the Firebase JS SDK v10 `auth` component registration. Be aware it is a
  blunt, global switch: every package that ships only an `exports` map has to
  fall back to `main`/`react-native`/`browser`. It happens to be fine with your
  current dependency set; re-verify after any dependency upgrade. The narrower
  alternative is to keep package exports on and add
  `config.resolver.unstable_conditionNames = ['require', 'default', 'react-native']`.
* `eas.json` — duplicates the Firebase config in all three profiles while also
  declaring `"environment"`. Redundant with `app.json` → `expo.extra.firebase`
  and with EAS environment variables. See 5.1.
* `app.json` — `extra.router: {}` is a legacy field; removable.
* `firebase.json` — `crashlytics_debug_enabled: true` in release. See 5.3.
* `/android` and `/ios` are gitignored and untracked → EAS runs `expo prebuild`
  (CNG workflow). Your local `android/` directory is therefore irrelevant to the
  EAS build; don't debug against it.
* `tsconfig.json`, `expo-env.d.ts` — correct and idiomatic for SDK 54.

## 9. Verification results

Run against the committed source, on Linux, with dependencies installed from
your `package-lock.json`:

```
export:embed --platform android --dev false --minify false            EXIT 0   1655 modules, 8.63 MB bundle
export:embed  + --sourcemap-output                                    EXIT 0   14.99 MB sourcemap
export:embed  with .env removed (EAS condition)                       EXIT 0
hermesc -emit-binary -O                                               EXIT 0   5.26 MB .hbc  (warnings only)
tsc --noEmit                                                          EXIT 0   0 errors
expo-doctor                                                           16/18    2 failures are network-only
```

Not run, and why:

* `npx expo start --clear` — needs an interactive dev server + device/emulator;
  it exercises the *development* bundle, not the phase that is failing.
* `npx expo export` — different target (minified, `dist/`, web-capable). It is
  **not** what EAS Android runs; `export:embed` is, and that passed.
* `eas build --platform android` — requires your EAS credentials.

### Log lines I still need to close this out

Run `eas build:list --platform android --limit 5`, open the failed build, and
send:

1. The **git commit SHA** and **build profile** shown in the build detail header.
2. The whole **`Install dependencies`** phase (did `npm ci` warn or fall back?).
3. The whole **`Prebuild`** / `Run expo prebuild` phase output.
4. The **`Bundle JavaScript`** phase in full — specifically everything from the
   line `> Task :app:createBundleReleaseJsAndAssets` (or `Starting Metro Bundler`)
   down to the first line matching any of:
   * `Unable to resolve module` / `None of these files exist`
   * `SyntaxError` / `Unexpected token`
   * `error: ` / `Error: `
   * `FATAL ERROR: ... JavaScript heap out of memory`
   * `Killed` / `exit code 137` (OOM-kill)
5. The 20 lines *immediately before* that first error.

Or attach the raw log: on the build page → **⋯ → Download logs**, or
`eas build:view <BUILD_ID> --json`.

## 10. Final confirmation

I **cannot** confirm the Android EAS build will complete, because I could not
find a defect that would stop it — the phase you say is failing passes
end-to-end here on your committed code, including Hermes bytecode generation.

What I can confirm: **the JavaScript in this repo bundles, minifies to Hermes
bytecode, and type-checks cleanly for `android` / `release`.** If EAS is still
failing on commit `ad59154`, the cause is on the EAS side of the line
(worker memory, dependency install, or a stale build), and the log lines in §9
will name it in one read.

Two things to try before sending logs — either would resolve the two most
likely remaining causes:

```bash
# 1. Make sure EAS is building what I tested, and normalise the CRLF churn.
git add -A && git commit -m "chore: normalise line endings" && git push

# 2. Re-run with a bigger Node heap for the bundle phase.
#    eas.json → build.production:
#      "env": { "NODE_OPTIONS": "--max-old-space-size=8192" }
eas build --platform android --profile production --clear-cache
```

---

*No files in this repository were modified while producing this report. All
reproduction work was done on a throwaway copy.*
