# Desktop Updates

How a published release reaches Vibyra at launch and while a workspace is
already open.

## Feed and trust boundary

The updater is `@tauri-apps/plugin-updater` against the endpoint in
`desktop-tauri/src-tauri/tauri.conf.json`:
`…/web-api/updates/{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}`.
The Rust plugin makes the request over reqwest, so the webview CSP does not
apply. A 204 means the client is current; a 200 must contain a signed release.

`updateStore` keeps the Rust-owned `Update` handle outside Zustand and closes a
replaced handle. Check, download, and install are independently single-flight.
The store returns booleans from those operations so startup orchestration can
distinguish a completed stage from a retryable failure.

## Packaged startup gate

`App` starts `useStartupUpdate` and account restoration together, but renders
the updater gate before authentication or `WorkspaceApp`. Consequently no
terminal process, session restore, or close guard exists while a startup update
is checking, downloading, installing, or retrying.

Packaged launches follow this sequence:

1. Check immediately with an 8 s metadata timeout.
2. If current, keep the stable startup surface visible for at least 600 ms and
   continue to auth/workspace.
3. If a release exists, download it automatically with honest determinate or
   indeterminate progress, install it, and let Tauri restart the process.
4. A failed stage offers **Try again** for that exact stage and **Open Vibyra**
   as the escape path. An unexpected successful install that does not exit has
   a 3 s watchdog and a relaunch-only retry, so it cannot strand the window on
   “Installing” forever.

`import.meta.env.DEV` bypasses the automatic gate so ordinary `npm run app:dev`
sessions never contact or install from the production feed. `AuthScreen`,
`WorkspaceApp`, and session persistence are lazy boundaries; in particular,
the startup install path does not load terminal persistence code.

## Open-workspace behavior

After the gate, `useUpdateWatch` polls every 20 minutes. Its legacy 8 s first
check runs only if no startup check has occurred, preventing duplicate launch
requests. A later release keeps the existing user-controlled flow: download,
then explicitly restart. `restart()` dynamically loads and awaits
`saveSessionNow(true)` before installation because Tauri relaunch does not
raise the window close event. A startup install deliberately skips that save
because terminals have not mounted.

`updateStore` tracks two state machines that must remain separate:

- **`status`** — `idle → available → downloading → ready → installing`, plus
  `error` / `restartError`. This drives update actions and notifications.
- **`checkState`** — `idle → checking → done | failed`, with `checkError` and
  `lastCheckedAt`. This makes feed failures visible in Settings without
  pretending a release exists.

When the workspace mounts, `useUpdateNotifications` announces the current
store snapshot before subscribing, so a startup failure carried through via
**Open Vibyra** remains reachable rather than being lost between surfaces.

## User surfaces

1. `StartupUpdateScreen` — the pre-auth Graphite+Cobalt packaged-launch surface
   with native window controls, accessible progress, reduced motion, bounded
   error copy, visible retry focus, and responsive failure actions.
2. Pinned update notification — converts a later updater state into the shared
   notification store.
3. Account-menu update action — keeps later update work reachable after a
   notification is dismissed.
4. Settings → Updates — always shows installed version, last successful check,
   feed failure, and a manual action.
5. `PostUpdateChangelog` — a deferred, versioned release modal shown only after
   an installed target relaunches and the auth/workspace surface is ready.

## Post-update changelog

Immediately before either startup or in-workspace installation,
`updateStore` best-effort records the signed target in the account-independent
`vibyra.desktop.postUpdateChangelog` receipt. Storage failure never blocks the
install. After relaunch, the deferred changelog requires an exact bundled entry
for the running version. The 0.2.9 and 0.3.0 entries allow an unmarked first
launch as one-release bridges: 0.2.8 cannot mark 0.2.9 pending, and the shipped
0.2.9 updater cannot mark 0.3.0 pending. Dismissal still makes either view
strictly one-time, including on a fresh install. Starting with 0.3.1, entries
should be receipt-only because 0.3.0 writes the pending target. Development
stays silent unless `VITE_CHANGELOG_PREVIEW_VERSION` explicitly enables visual
QA.
Dismissal records the version and clears pending state, while a crash leaves it
pending for the next launch. The modal waits for auth/workspace and any first
welcome, then owns focus/inert state; content, CSS, and its sub-100 KB artwork
remain outside the updater startup chunk. Start in
`src/components/changelog/`, `src/lib/postUpdateChangelogPolicy.ts`, and
`tests/postUpdateChangelog.test.mjs`.

## Release pipeline

`.github/workflows/desktop-release.yml` remains manual and does not publish.
Before building, `scripts/verify-release.mjs` requires `package.json` and
`tauri.conf.json` versions to match, validates an old/current/future client
against every NSIS/AppImage/deb feed route, and rejects a release candidate the
live feed says is stale. After each build it verifies non-empty artifacts,
SHA-256, Minisign signatures (including trusted comments and configured key),
and generated metadata. A final job re-verifies the complete three-platform
artifact set before a person can publish it.

The 0.3.0 candidate demonstrated the intended boundary: build and signing ran
without publishing, the complete artifact set was downloaded and re-verified,
artifacts were uploaded to hidden names, remote sizes and hashes were checked,
and final names were switched atomically. All 24 release metadata values were
then set with `railway variable set --skip-deploys` and compared to CI metadata
before one exact-source deployment exposed the new feed. Keep that staged
sequence; do not let a metadata write trigger a partial release deployment.

## Validation

Canonical local gates are `npm run verify` in `desktop-tauri`, the backend
`DesktopUpdateFeedTest`, and `cargo test --test updater_signing --locked`.
`tests/startupUpdatePolicy.test.mjs`, `startupUpdateReliability.test.mjs`,
`updateReliability.test.mjs`, and `releasePackaging.test.mjs` cover the new
boundaries. Visual QA should include 1440×900 and minimum 960×600 failure,
determinate download, and reduced-motion indeterminate states.

On 2026-08-28, a normally mounted, isolated AppImage built from 0.2.8 completed
a live signed 0.2.9 download, replaced only its temporary copy, relaunched under
a new process, opened authentication, and closed through the shared window
control. `APPIMAGE_EXTRACT_AND_RUN=1` is useful for launch smoke tests but cannot
prove relaunch because it removes the temporary mount; use normal FUSE execution
for AppImage handoff QA.

## Published 0.3.0

Vibyra 0.3.0 was published on 2026-08-28 from commit
`3b1636b9f9c07ccfebcf54eddfc599c5d6034180` and annotated tag `v0.3.0`.
GitHub Actions run `33211698641` passed Windows NSIS install/launch, AppImage
launch, Debian install/launch, checksums, signatures, metadata, and the aggregate
release-set gate. Railway production deployment
`eb3ae982-39a1-480f-a42c-4b7cf1600715` then passed health and served:

- Windows NSIS: 6,659,886 bytes, SHA-256
  `08285557d179e794921bb6490dcec2d0fba35943e703b6fca3048e0f4b2e5c15`.
- Linux AppImage: 97,180,152 bytes, SHA-256
  `f3294df8c6f96898bf803d21b4c5b21b1f80b41ce795d8a75ddd2eb9bcf4d1d5`.
- Debian package: 9,186,324 bytes, SHA-256
  `08d1c069fd12f3bd1442b4217a1974ac4dbaac1468a9e4ff67730007dc7becfd`.

Post-cutover verification fetched all three public downloads and reproduced
those hashes, validated all three signed N−1 feeds as 200, and validated current
and future versions as 204. The website release API and bundled What's New copy
both advertised 0.3.0. Production telemetry also showed two real 0.2.9
AppImage clients at distinct public IPs receiving the 0.3.0 offer. Existing
0.2.9 clients poll every 20 minutes and retain the user-controlled
download/restart flow, so publication proves delivery of the offer, not a
forced installation on offline machines or a restart without consent.

Local tests cannot prove every OS installer path, protected CI secrets must
remain in CI, and macOS is not in the current release matrix.

## Published 0.4.2

Vibyra 0.4.2 superseded the live 0.4.0 release on 2026-09-02; 0.4.1 was never
published. The exact signed source is commit
`21cc02d3d4a70e92e8ef3993ce95289062014709` and annotated tag `v0.4.2`.
GitHub Actions run `33616986020` passed the complete frontend/Rust gates,
Windows NSIS install/launch, AppImage launch, Debian install/launch,
checksums, updater signatures, metadata, and the aggregate release-set gate.
Windows-specific scaffold tests must gate Unix-only imports and compare paths
as `Path` values rather than slash-formatted strings.

Railway production deployment `5c5a7002-3815-4bab-91f9-42c1dafaa0f1` passed
`/up` and published the updated website plus all three release records:

- Windows NSIS: 8,131,858 bytes, SHA-256
  `003f55ec82845dd35fb274d045c94ab89f86f7ef1e34f50ae1980b2cc8d703e8`.
- Linux AppImage: 99,035,640 bytes, SHA-256
  `723014ee1bb2101d8b6733f057ca001f21978655f5e491af972c3f424ca521ec`.
- Debian package: 11,292,676 bytes, SHA-256
  `6154b89944abf220935f346ee4435591876b41fb7115d16a38d113ff0e79a66b`.

Post-cutover checks fetched each public download and reproduced those hashes;
the Windows, AppImage, and deb updater feeds all returned 200 for an old client
and 204 for current/future clients. `/web-api/releases` advertised 0.4.2 for
all supported formats, and the live portal bundle contained the four new
website highlights. The desktop bundle includes matching 0.4.2 What's New
content; the updater marks 0.4.2 pending before install, and the regression
test proves the modal appears once after relaunch and remains dismissed.

The stable local launcher path
`/home/ellis/.local/opt/vibyra/Vibyra.AppImage` was atomically replaced with
the verified 0.4.2 AppImage. Do not restart a running Vibyra process during an
agent session; the new inode is used on the next normal launch.
