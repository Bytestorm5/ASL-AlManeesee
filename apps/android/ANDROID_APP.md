> **Carried over from the Mutūn app.** The steps are the same for this
> collection; the package id (`com.alasl.almaneesee`) and host
> (`almaneesee.al-asl.com`) in `twa-manifest.json` are placeholders to set
> before the first build — the host must match `SITE.url` in
> `src/config/site.ts`. Digital Asset Links: once the app is signed, publish
> its fingerprints at `public/.well-known/assetlinks.json` (not shipped until
> then, since a wrong file is worse than none).

# Publishing al-Asl Mutūn to the Google Play Store

This turns the website into a real Android app using a **Trusted Web Activity
(TWA)** — a fullscreen Android wrapper around `almaneesee.al-asl.com`. The app shows
the live site (so content updates appear with no app re-release) and, thanks to
the service worker that is now part of the site, the poems also read **offline**.

Everything on the **website side is already done** (see "What is already set
up"). What remains is generating the signed app package and uploading it to
Google Play — steps that need your own Google account, so they cannot be
automated for you. The two build options below are ordered easiest-first.

---

## Live domain

The app's domain is **`almaneesee.al-asl.com`** (HTTPS). Every reference in this repo
already uses it: `manifest.webmanifest`, `apps/android/twa-manifest.json`,
`.well-known/assetlinks.json`, and the in-app links. Nothing to change.

---

## What is already set up (on the website)

These files were added/committed to the repo and take effect as soon as the
site is deployed:

- `manifest.webmanifest` — makes the site an installable app (name, icons,
  colours, standalone display).
- `sw.js` — service worker; precaches the three poems + fonts so they open
  offline, and serves fresh content when online.
- `icon-192.png`, `icon-512.png`, `icon-192-maskable.png`,
  `icon-512-maskable.png` — the app icons (the al-Asl medallion).
- `.well-known/assetlinks.json` — the Digital Asset Links file that links the
  app to the website (one value still to fill in — see Step 4).
- `privacy.html` — a privacy policy page (Google Play requires a privacy
  policy URL): `https://<your-domain>/privacy.html`.
- PWA `<link>`/`<meta>` tags + service-worker registration added to all four
  pages.

**Before building the app, deploy these website changes** and verify in a
browser that these URLs load:
- `https://<your-domain>/manifest.webmanifest`
- `https://<your-domain>/sw.js`
- `https://<your-domain>/icon-512.png`
- `https://<your-domain>/.well-known/assetlinks.json`
- `https://<your-domain>/privacy.html`

Tip: in Chrome on your phone, open the site → menu → "Add to Home screen". If
it installs as an app and opens fullscreen, the PWA is working and the TWA will
work too.

---

## Step 1 — Create a Google Play developer account

- Go to <https://play.google.com/console>, sign in with the Google account that
  should own the app, and register as a developer.
- One-time fee: **US $25**.
- For a non-personal/brand account, choose an **Organisation** account; Google
  will ask for verification details. This can take a few days, so start early.

---

## Step 2 — Build the signed app package (.aab)

You need an Android App Bundle (`.aab`). Pick **one** option.

### Option A — PWABuilder (easiest, no tools to install) ✅ recommended

1. Go to <https://www.pwabuilder.com>, enter your live domain
   (e.g. `https://almaneesee.al-asl.com`), and click **Start**.
2. It scores the PWA (manifest + service worker are already in place) → click
   **Package for stores** → **Android**.
3. In the Android options set:
   - **Package ID**: `com.alasl.almaneesee`
   - **App name**: `Mutun`  ·  **Short name**: `Mutun`
   - Keep "Signing key" = **Create new** (PWABuilder generates one and returns
     it in the zip — **keep that `signing.keystore` + passwords safe forever**;
     you need them for every future update).
4. Download the zip. It contains:
   - `app-release-signed.aab`  ← upload this to Play
   - `assetlinks.json`  ← contains your real SHA-256 fingerprint (see Step 4)
   - the signing key + a readme with the passwords.

### Option B — Bubblewrap CLI (for a developer machine)

Requires Node 18+ and a JDK. Run on your own computer (not needed if you used
Option A):

```bash
npm install -g @bubblewrap/cli

# point it at the deployed manifest; accept the JDK/Android SDK download prompts
bubblewrap init --manifest https://almaneesee.al-asl.com/manifest.webmanifest
#   Package name ......... com.alasl.almaneesee
#   App name ............. al-Asl Mutūn   (launcher: Mutūn)
#   (the rest can be taken from apps/android/twa-manifest.json in this repo)

bubblewrap build
#   creates app-release-bundle.aab  and  android.keystore (KEEP IT SAFE)
#   prints the SHA-256 fingerprint you need for Step 4
```

`apps/android/twa-manifest.json` in this repo mirrors all the answers (colours,
icons, app shortcuts) so the app matches the site branding.

> **Keep your signing key and its passwords backed up.** If you lose them you
> can no longer publish updates under the same app (unless you enrol in Play
> App Signing, which is recommended — see Step 4).

---

## Enable R8 optimization (clears the Play Console recommendation)

Play Console may show a **Technical quality** recommendation:
*"Improve your app's memory and performance with R8 optimization."* It means the
uploaded release was built with **R8 minification turned off** (`minifyEnabled
false`). This app is a thin TWA wrapper, so the real-world gain is small, but
enabling R8 is safe and clears the card.

The Android Gradle project is **generated at build time** (Bubblewrap or
PWABuilder) and is **not committed** here, so the setting must be applied to the
generated project. Two ways:

### Automatic (recommended)

After the project is generated, run this from the generated project's root
(the folder that contains `app/build.gradle`):

```bash
node <path-to-this-repo>/apps/android/enable-r8.mjs .
```

It sets `minifyEnabled true` + `shrinkResources true` on the release build, points
ProGuard at `proguard-android-optimize.txt`, writes `android.enableR8.fullMode=true`
to `gradle.properties`, and installs the TWA-safe keep-rules from
`apps/android/proguard-rules.pro`. It only touches the **release** build type and is
**idempotent** (safe to re-run).

### Manual

Edit `app/build.gradle` → the `release` build type:

```gradle
buildTypes {
    release {
        minifyEnabled true          // was false — this is what Play flags
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

and add to `gradle.properties`:

```properties
android.enableR8.fullMode=true
```

No custom keep-rules are strictly required — the `androidbrowserhelper` library
ships its own, and manifest-declared activities/services are kept automatically —
but copy `apps/android/proguard-rules.pro` to `app/proguard-rules.pro` as a safety net.

Then rebuild the `.aab`, bump `appVersionCode` (last upload was **2**, so use
**3**) and `appVersionName` in `apps/android/twa-manifest.json`, and upload a new
release. The recommendation clears once Play processes a build with R8 on.

> **Bubblewrap note:** apply this *after* `bubblewrap init` / `bubblewrap update`
> and *before* `bubblewrap build`. Re-running `bubblewrap update` regenerates
> `app/build.gradle`, so just re-run the script afterwards.

---

## Stop the black flash when the app opens

Opening the Android app shows a black screen for a moment, between Android's
splash and the first paint of the page. The iPhone app never does, and the
reason is in the generated project rather than in the site.

Bubblewrap gives the **whole application** this theme:

```xml
<application android:theme="@android:style/Theme.Translucent.NoTitleBar">
```

and `LauncherActivity` declares no theme of its own, so it inherits it. A
translucent window paints nothing, so whatever is behind it shows — and while
Chrome is still warming up, that is black. Nothing else in the generated project
sets `windowBackground`, and on Android 12+ nothing sets
`windowSplashScreenBackground` either, which is why the system splash is white
rather than the app's cream.

The splash hand-off itself is already wired up correctly — `SPLASH_IMAGE_DRAWABLE`,
`SPLASH_SCREEN_BACKGROUND_COLOR`, `SPLASH_SCREEN_FADE_OUT_DURATION` and
`FILE_PROVIDER_AUTHORITY` are all in the generated manifest. It is only the
window underneath that has no colour.

iOS has no such gap because `ios/Mutun/Info.plist` gives the app a
`UILaunchScreen` of `LaunchBackground` — `#F9F4EA`, the same cream as
`background_color` in `manifest.webmanifest` — and it covers the whole wait,
however long it runs. This gives Android the same backstop.

### Automatic (recommended)

After the project is generated, run this from the generated project's root
(the folder that contains `app/build.gradle`):

```bash
node <path-to-this-repo>/apps/android/fix-launch-flash.mjs .
```

It gives `LauncherActivity` a theme of its own whose window background is
`@color/backgroundColor`, adds `windowSplashScreenBackground` for Android 12+,
and leaves the application's translucent theme alone — the helper activities
(`FocusActivity`, `ManageDataLauncherActivity`) rely on it. The colour is not
hard-coded: `@color/backgroundColor` is emitted by the generated
`app/build.gradle` from `backgroundColor` in `apps/android/twa-manifest.json`, so it
follows that file. Idempotent, like the R8 script.

### Manual

1. `app/src/main/res/values/styles.xml`:

```xml
<resources>
    <style name="Theme.AlAslLauncher" parent="@android:style/Theme.Material.Light.NoActionBar">
        <item name="android:windowBackground">@color/backgroundColor</item>
    </style>
</resources>
```

2. `app/src/main/res/values-v31/styles.xml` — the same, plus:

```xml
        <item name="android:windowSplashScreenBackground">@color/backgroundColor</item>
```

3. `app/src/main/AndroidManifest.xml`, on the `LauncherActivity` element:

```xml
<activity android:name="LauncherActivity"
    android:theme="@style/Theme.AlAslLauncher"
    …>
```

> Same Bubblewrap note as above: apply it after `init`/`update`, before `build`.
> And check it on a handset — a cold start is the only place this shows.

---

## Step 3 — Create the app in Play Console and upload

1. Play Console → **Create app**. Name `al-Asl Mutūn`, type **App**, category
   **Education** (or **Books & Reference**), free.
2. **Release → Production → Create new release.**
3. Keep **Play App Signing** turned on (default, recommended — Google securely
   holds the final signing key; the key from Step 2 becomes your "upload key").
4. Upload the `.aab` from Step 2. Set version name `1.0.0`.
5. Save (don't roll out yet — finish Step 4 and the listing first).

---

## Step 4 — Finish Digital Asset Links (removes the browser URL bar)

This is what makes the app open fullscreen with **no address bar**. The app and
the site must vouch for each other via a SHA-256 certificate fingerprint.

1. Get the **App signing key SHA-256**:
   - Play Console → your app → **Test and release → App integrity → App
     signing** → copy the **SHA-256 certificate fingerprint**.
   - (If you skipped Play App Signing, use the fingerprint that Step 2 printed.)
2. Put it into `.well-known/assetlinks.json`, replacing
   `REPLACE_WITH_APP_SIGNING_KEY_SHA256_FROM_PLAY_CONSOLE`:
   ```json
   "sha256_cert_fingerprints": ["AB:CD:EF:...:99"]
   ```
   (If PWABuilder gave you an `assetlinks.json`, just use its contents — same
   thing.)
3. **Re-deploy the site** and confirm it loads at
   `https://<your-domain>/.well-known/assetlinks.json` as JSON.
4. Verify with Google's tool:
   <https://developers.google.com/digital-asset-links/tools/generator>

If this fingerprint is wrong or the file isn't reachable, the app still works
but shows a thin Chrome address bar at the top. Fix the file + redeploy and it
disappears (may take a reinstall).

---

## Step 5 — Complete the store listing

Play Console → **Grow → Store presence → Main store listing**:

- **App name**: al-Asl Mutūn
- **Short description** (≤80 chars), e.g.:
  *"The Khāqāniyyah, Jazariyyah & Shāṭibiyyah — with English & Urdu translation."*
- **Full description**: describe the three texts, translations, word-by-word
  meanings, offline reading, and PDF downloads.
- **App icon**: upload `icon-512.png` (512×512).
- **Feature graphic**: use `apps/android/play-assets/play-feature-graphic.png`
  (already made at the required 1024×500).
- **Phone screenshots**: use the five in `apps/android/play-assets/screenshots/`
  (1080×1920 each):
  1. `01-collection.png` — the collection / brand intro
  2. `02-khaqaniyyah-english.png` — a poem with English translation
  3. `03-khaqaniyyah-urdu.png` — Arabic + English + Urdu together
  4. `04-shatibiyyah.png` — chapter navigation bar
  5. `05-jazariyyah-wordbyword.png` — tap-a-word meaning + translation
  (Upload at least 2; all five tell the fuller story.)

Then complete the required questionnaires under **Policy / App content**:
- **Privacy policy**: `https://<your-domain>/privacy.html`
- **Data safety**: declare **no data collected / no data shared** (the app
  collects nothing; preferences stay on-device).
- **Content rating**: fill the questionnaire → it will rate **Everyone**.
- **Target audience**: choose your age groups (this is general-audience
  educational content).
- **Ads**: none.

---

## Step 6 — Submit for review

Roll out the Production release. First-time review typically takes from a few
hours up to a few days. Once approved, the app is live on Google Play. 🎉

---

## Keeping the app updated

- **Content changes** (new translations, fixes, new verses): just update and
  deploy the website. The app shows them automatically — **no new app version
  needed.** Returning users get fresh content; the service worker keeps the
  last-seen version available offline.
  - When you change the offline file list in `sw.js`, bump `CACHE_VERSION`
    (e.g. `v1` → `v2`) so devices refresh their cache.
- **App changes** (icon, name, app shortcuts, Android settings): edit
  `apps/android/twa-manifest.json`, bump `appVersionCode` (and `appVersionName`),
  rebuild with the **same signing key**, and upload the new `.aab`. After the
  project is regenerated, re-run `node apps/android/enable-r8.mjs .` from its root so
  R8 stays on (see "Enable R8 optimization" above).

---

## File map (in this repo)

| File | Purpose |
|------|---------|
| `manifest.webmanifest` | Web app manifest (installable PWA) |
| `sw.js` | Service worker (offline caching) |
| `icon-192/512(.|-maskable).png` | App icons |
| `.well-known/assetlinks.json` | App ↔ site verification (fill in fingerprint) |
| `privacy.html` | Privacy policy (required by Play) |
| `apps/android/twa-manifest.json` | Bubblewrap/TWA build configuration |
| `apps/android/enable-r8.mjs` | One-command R8 enable for the generated project |
| `apps/android/fix-launch-flash.mjs` | Gives the launcher window the app's cream, so the launch has no black gap |
| `apps/android/proguard-rules.pro` | TWA-safe R8/ProGuard keep-rules (safety net) |
| `apps/android/ANDROID_APP.md` | This guide |
