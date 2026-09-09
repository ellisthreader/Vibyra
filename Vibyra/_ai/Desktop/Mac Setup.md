# Desktop - Mac Setup

Vibyra Desktop builds natively for Apple Silicon from `desktop-tauri/` with
Node.js 24 LTS, the repository-pinned Rust 1.97.1, and Xcode 26.6. Finish Xcode's
first-launch licence, administrator authorization and required components;
`xcodebuild -checkFirstLaunchStatus` must succeed before native builds.

Install locked dependencies with `npm ci`. `npm run app:build` now dispatches
to the native Mac installer (`scripts/install.mjs` → `install-macos.mjs`):

```bash
npm run app:build
# Build without installing:
node scripts/install-macos.mjs --build-only
# Install an already built bundle:
npm run app:install:only
```

The installer resolves Cargo's target directory, checks the bundle version,
stages/signs/verifies the app, then replaces `/Applications/Vibyra.app` while
retaining the previous bundle. `VIBYRA_MAC_APP_PATH` overrides the destination.
It refuses to replace a running Vibyra and never closes user terminals. Use
`ps -axww -o comm=` for detection: macOS `pgrep` omits ancestor processes,
including Vibyra when it hosts the terminal running the installer. After a
bundle replacement, an existing process still executes the old mapped binary;
check `lsof -p PID -a -d txt` when the displayed models disagree with source.
Ad-hoc signing is for local use; updater signature verification stays enabled.
Without the release key, only updater artifact creation is skipped locally.
`Info.plist` supplies the microphone usage description; the Mac config includes
`Entitlements.plist` for audio input. The local signing command must keep that
entitlement so dictation also works with hardened release builds. Check both
the packaged purpose string and `codesign -d --entitlements :-` when changing
Mac native audio. Recording permission is requested only on the user action.

`.github/workflows/desktop-release.yml` includes native Apple Silicon and Intel
Mac jobs. They build signed `.app.tar.gz` updater artifacts, verify Developer ID
acceptance/notarization and smoke-test launch before upload. Apple signing and
notarization secrets plus the Tauri update key are required for distribution;
adding the jobs does not publish a release to the backend update feed.

The local `plan` skill requires checking the actual installed version, signature
and launch when updating an installed app. Validate frontend build/tests and
native core tests on Mac. The native core
suite covers real PTY spawning, file/memory handling and loopback previews.
Temporary paths may resolve from `/var` to `/private/var`; path expectations
must compare canonical paths. See [[Projects And Preview]] for the inherited
nonblocking-socket fix required for fragmented HTTP request headers on macOS.

Account sign-in, provider authorization and any required API keys are separate
from installation. Verify the actual workspace after sign-in; a successful
build alone does not prove live agent or backend operations.

The all-target native checks must gate Linux-only screenshot helpers and the
X11 `capture_probe` example to Linux (helpers also compile for their tests).
Do not weaken `-D warnings` to make Mac packaging pass.

For the Mac 0.1.8 UI and session lifecycle changes, see
[[Mac Experience And Sessions]]. After quitting Vibyra, double-click
`desktop-tauri/scripts/install-macos.command` to install the verified existing
bundle and launch it. This is useful when the agent building the update runs
inside Vibyra itself; never kill that active workspace to complete installation.
