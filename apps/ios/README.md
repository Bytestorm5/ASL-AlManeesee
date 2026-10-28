# iOS shell (AlManeesee)

A thin WKWebView wrapper around https://almaneesee.al-asl.com — the iOS counterpart
of the Android TWA. Site deploys update the app instantly; a new binary is only
needed for icon/name/SDK changes.

- **No Mac required.** `.github/workflows/ios-testflight.yml` builds and uploads
  to TestFlight on a GitHub-hosted Mac runner. Setup steps (API key + secrets)
  are documented at the top of that workflow file, and in App Store Connect.
- The Xcode project is **generated**, not checked in: `apps/ios/project.yml` is an
  [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec; CI runs
  `xcodegen generate --spec apps/ios/project.yml --project apps/ios`.
- Bundle ID `com.alasl.almaneesee`, universal (iPhone + iPad), iOS 15+.

How the shell works:

- Loads `https://almaneesee.al-asl.com/?appmode=1` so `app-shell.js` switches on the
  installed-app chrome (top plate, bottom tabs) — same trigger the TWA uses.
- `WKAppBoundDomains` = `al-asl.com` + `limitsNavigationsToAppBoundDomains`
  enables the **service worker** inside WKWebView, so offline works after the
  first online launch.
- External links (and `target="_blank"`) open in an in-app Safari sheet;
  `mailto:`/`tel:`/WhatsApp links go to the system.
- Status-bar plate and launch screen colors match the site theme in light and
  dark mode (`Assets.xcassets`).
- If the very first launch happens with no network, a retry screen is shown
  (after one successful load the service worker takes over).

## Before the first build

The host, bundle id and name are placeholders carried over from the Mutūn app,
renamed for this collection. Set them for real in `App/WebViewController.swift`
(`appHost`, `startURL`), `App/Info.plist` (`WKAppBoundDomains`, display name)
and `project.yml` (`PRODUCT_BUNDLE_IDENTIFIER`, `PRODUCT_NAME`) — the host must
match `SITE.url` in `src/config/site.ts`.
