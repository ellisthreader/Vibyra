---
tags: [vibyra, memory, backend, website, downloads]
updated: 2026-08-19
---

# Website Accounts And Downloads

The Laravel public website shares the canonical `users` table with the Expo app
and Vibyra Desktop. Browser authentication uses Laravel's `web` guard, session
cookie, and CSRF protection. Existing `/api/*` mobile/desktop clients continue
to use `VibyraSession` bearer tokens; do not substitute browser cookies for
those clients.

## Website routes

- Public views: `/login`, `/signup`, `/billing`, `/billing/success`,
  `/billing/cancel`, `/downloads`, and `/account/downloads`.
- Authenticated view: `/account`.
- Browser JSON lives under `/web-api/*`; email auth, Google/Apple provider
  exchange, session, Stripe checkout/portal, and release metadata use this
  boundary.

Google/Apple browser auth reuses `DesktopProviderOAuthFlow`, verifies its
one-time bearer token through `SessionAuthenticator`, establishes the web
session, then deletes the transient bearer session.

## Membership boundary

Desktop downloads are free and do not require an account, session, membership,
or payment. Membership remains relevant to credits, project/agent limits, and
account billing features. `MembershipEntitlement` still recognises paid,
unexpired `starter`, `builder`, and `pro` plans for those product entitlements;
it must not be reintroduced as a download gate.

## Release contract

`config/releases.php` maps Windows, Linux, macOS arm64, and macOS x64 metadata to private Laravel
storage. `/web-api/releases` returns safe metadata only; it never returns the
storage disk or internal path. `/web-api/releases`, `/downloads/windows`, and
`/downloads/linux`, `/downloads/macos-arm64`, and
`/downloads/macos-x64` are public. The file routes stream attachments with their
byte length and SHA-256 checksum. Missing artifacts return controlled
`503 release_unavailable` responses.

Configure `VIBYRA_RELEASE_DISK` plus the platform-specific
`VIBYRA_{WINDOWS|LINUX}_RELEASE_{VERSION|PATH|FILENAME|SIZE|SHA256}` values,
plus `VIBYRA_MACOS_ARM64_RELEASE_*` and
`VIBYRA_MACOS_X64_RELEASE_*`. The release API keeps one aggregate
`platform: macos` card with arm64/x64 variants. Each Mac variant requires
complete metadata, a 64-hex checksum, positive exact file size, DMG extension,
and a real non-empty stored artifact. Browser detection may recommend macOS but
must never guess Apple Silicon versus Intel.

The current Linux beta is app version `0.1.1` (product name `Vibyra`, blue V
icon). Its volume artifact is `releases/linux/Vibyra_0.1.1_amd64.AppImage`,
served to browsers as `Vibyra.AppImage`. Windows remains
`Vibyra-Desktop-0.1.0-beta.1-x64-setup.exe` until its next rebuild. 0.1.1
fixed a fatal launch bug: the AppImage's bundled GLib scanned host gio modules
(gvfs built against newer GLib), which killed WebKitWebProcess and left a
frozen blank window; `run()` now sets `GIO_MODULE_DIR` to the bundled modules
dir when `APPDIR` is set. `bundleMediaFramework` is enabled so autoaudiosink
ships in the AppImage. Keep defaults, Railway variables, website metadata, and
checksums in sync with these names.

## Download page UI

Keep `/downloads` deliberately minimal: one title, one short no-account line,
and Windows/macOS/Linux choices. Each choice may show only the OS
requirements, version, size, and a subtle recommendation. Do not restore
benefit-pill rows, decorated outer panels, filename tables, checksum sections,
or a second nested download button. Start with `DownloadsPage.jsx`,
`DownloadCard.jsx`, `MacDownloadCard.jsx`, and `css/portal/downloads.css`.
The Mac card uses two small, explicitly labelled architecture actions only when
their artifacts are ready. Platform marks live under
`backend/public/platform-icons/`: use the official Microsoft symbol for Windows
the Apple symbol for macOS, and the Linux Foundation Tux artwork for Linux, preserving their original
colours rather than replacing them with text placeholders or recolouring them.

## Local blank-page check

If Laravel returns `200` but the marketing or portal page is blank, inspect
`backend/public/hot` before changing application code. A stale marker can make
`@vite` target a stopped development server; move the marker out of `public/`
and use the current `public/build/manifest.json` bundle. Then check the browser
console as well as HTTP asset responses. The marketing hero renders
`motion.video`, so `HeroScrollVideo.jsx` must import `motion`; guard this with
`node --test resources/js/marketing/marketing.source.test.mjs` and rebuild with
`npm run build` from `backend/`.

For the standalone local website, use `npm run website` and open
`http://127.0.0.1:8128`. `scripts/serve-website.mjs` keeps the browser-facing
Node proxy on `8128` and Laravel on `8129`, so speculative idle browser sockets
cannot block PHP's single-threaded development server.

## Railway production

The public marketing navbar and `/downloads` page are live at
`https://vibyra-production.up.railway.app`. Production smoke checks are `/`,
`/downloads`, `/web-api/releases`, and `/up`; the marketing bundle must contain
the `/downloads` CTA target. Windows and Linux release files live on the
`vibyra-volume` Railway volume mounted at
`/app/storage/app/private/releases`; `.railwayignore` must keep that directory
out of source archives because the combined installers exceed Railway's upload
limit. `ReleaseDownloadController` fails closed for every platform unless the
stored size and SHA-256 match complete metadata.

For large release uploads, upload to a hidden `.uploading-*` name with
`railway volume files --volume vibyra-volume upload <local> /linux/.uploading-<name>`,
verify the remote `stat -c %s` and `sha256sum` through `railway ssh` (the
upload can silently truncate, so never skip this), then promote with
`railway volume files rename`. Streaming through `railway ssh -- cat` also
works. After promotion, verify `/web-api/releases`, attachment
`Content-Length` and `X-Checksum-SHA256` headers, and a real GET signature
before declaring the buttons live.

Changing Railway env vars triggers a rebuild from the linked GitHub repo,
which is far behind the locally deployed working tree — the 2026-08-19 cutover
briefly 404'd the whole site this way. After any `railway variables --set`,
immediately re-run `railway up` from the repo root to restore the working-tree
snapshot.

Desktop release automation lives in `.github/workflows/desktop-release.yml`
and packages the Rust/Tauri app directly: native Windows NSIS on
`windows-latest`, and AppImage on Ubuntu 22.04. Build the public Linux artifact
without the local pkg-config development shim, confirm its embedded executable
requires no newer than glibc 2.35, and launch-smoke-test it. Cross-building the
NSIS package with `cargo-xwin` is a useful local compile/package gate, but the
native Windows CI install-and-launch smoke test remains the runtime gate.
Unsigned beta installers work but can trigger Microsoft SmartScreen, so do not
describe the Windows package as signed until a certificate is configured.

Keep `backend/bootstrap/cache/*.php` out of local Railway source snapshots as
well as release binaries; cached development providers such as Laravel Pail can
break a production `composer install --no-dev` build. If the Railway SSH relay
drops during a large upload, use the direct Railway SSH endpoint with
keepalives, still staging to a hidden name and verifying the remote checksum
before the atomic rename.

## Release messaging

The signed desktop updater is the release-notification path for installed
desktop clients: publish verified artifact bytes before changing all release
metadata, then verify the update feed from the preceding version. The mobile
`productUpdates` preference is local-only and is not a backend email or push
subscription.

`vibyra:announce-release` is only a version-deduplicated verified-account email
command; it does not identify affected installs or paid accounts, or provide
consent, suppression, unsubscribe, preview, or canary controls. Do not use it
as a general product-update broadcast until those controls and a valid
production mail transport are deliberately established. A unique delivery row
prevents ordinary reruns, but recording after the provider send is not
crash-safe or concurrency-safe exactly-once delivery.
