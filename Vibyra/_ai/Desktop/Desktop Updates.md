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
for the running version. The 0.2.9 entry alone allows an unmarked first launch
because the already-released 0.2.8 binary cannot write this new receipt; this
also means a fresh 0.2.9 install sees that one introduction. Later entries are
receipt-only. Development stays silent unless `VITE_CHANGELOG_PREVIEW_VERSION`
explicitly enables visual QA.
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

The checkout is currently 0.2.8 while the live feed advertises 0.2.9, so the
new release preflight correctly blocks this checkout until both desktop version
files are bumped. Do not weaken that check or publish an older build.

## Validation

Canonical local gates are `npm run verify` in `desktop-tauri`, the backend
`DesktopUpdateFeedTest`, and `cargo test --test updater_signing --locked`.
`tests/startupUpdatePolicy.test.mjs`, `startupUpdateReliability.test.mjs`,
`updateReliability.test.mjs`, and `releasePackaging.test.mjs` cover the new
boundaries. Visual QA should include 1440×900 and minimum 960×600 failure,
determinate download, and reduced-motion indeterminate states.

On 2026-08-28, a normally mounted, isolated AppImage built from this 0.2.8
source completed a live signed 0.2.9 download, replaced only its temporary
copy, relaunched under a new process, opened authentication, and closed through
the shared window control. `APPIMAGE_EXTRACT_AND_RUN=1` is useful for launch
smoke tests but cannot prove relaunch because it removes the temporary mount;
use normal FUSE execution for AppImage handoff QA.

Before publishing, still run N→N+1 on clean Windows NSIS and exercise Debian
elevation/replacement; repeat AppImage QA for the actual release candidate.
Local tests cannot prove protected CI secrets or every OS installer path, and
macOS is not in the current release matrix.
