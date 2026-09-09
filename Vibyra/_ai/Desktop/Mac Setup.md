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
Local installs use ad-hoc signing; updater signature verification stays enabled.
Without the release key, only updater artifact creation is skipped locally.
`Info.plist` supplies the microphone usage description; the Mac config includes
`Entitlements.plist` for audio input. The local signing command must keep that
entitlement so dictation also works with hardened release builds. Check both
the packaged purpose string and `codesign -d --entitlements :-` when changing
Mac native audio. Recording permission is requested only on the user action.

`.github/workflows/desktop-release.yml` includes native Apple Silicon and Intel
Mac jobs. The chosen beta workflow builds Tauri-authenticated, ad-hoc signed
`.app.tar.gz` artifacts and smoke-tests native launch. It does not establish
Developer ID acceptance or Apple notarization. CI alone does not publish an
update; verify the live backend feeds and real archive signatures afterward.

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

## Mac update publication

The published 0.1.8 source is on `release/macos-0.1.8-experience`. The user explicitly
chose an in-app beta update without Apple Developer credentials. The Mac-only
workflow uses ad-hoc Apple code signing (`APPLE_SIGNING_IDENTITY=-`) and the
existing Tauri private key for updater authentication. Apple notarization is
not a prerequisite for this chosen updater path; do not call it notarized or
promise Gatekeeper approval. Public DMG distribution remains separate.

`desktop-release.yml` dispatches the Mac-only reusable workflow when
`macos_only=true`, retaining Windows/Linux packaging checks. Both architecture
jobs run the full verify gate, build signed updater archives, check native
launch and microphone metadata. Use `codesign -d --entitlements - --xml` when
piping entitlements to a plist parser; the default display is not XML.
`examples/verify_update_bundle.rs` verifies real downloaded archives using the
same minisign implementation and public key as the app.

Railway login is now configured through `npx @railway/cli`. Production is
project `spectacular-charisma`, environment `production`, service `Vibyra`.
A dedicated local SSH identity is `~/.ssh/id_ed25519_railway_vibyra`, registered
with Railway. Never print keychain credentials: GitHub CLI entries can have a
`go-keyring-base64:` storage wrapper that must be handled before authentication.

Keep DMG download metadata separate from signed `.app.tar.gz` updater metadata.
The newer `release/0.6.3-macos` backend implements this separation; the older
local `main` backend expects DMGs in its shared release config. Check the live
backend contract before setting feed variables. Never replace the existing
Tauri key to work around missing access: installed clients trust its public key.

The live backend was checked and already has `config/macos-updates.php` and
`/downloads/{macos-arm64|macos-x64}/update`. Set `VIBYRA_MACOS_{ARM64|X64}_UPDATE_`
`VERSION/PATH/FILENAME/SIZE/SHA256/SIGNATURE` after both archives pass verification.
Upload to a unique hidden path on `vibyra-volume`, verify remote bytes/hash,
then promote. Use `variable set --skip-deploys` followed by ordinary `redeploy`
of the existing deployment; never use `--from-source`, since the linked source
is older than the deployed snapshot. Verify both feeds and unchanged non-Mac
release metadata after activation.

## Published checkpoint — September 9, 2026

Mac 0.1.8 is live for Apple Silicon and Intel through the in-app updater.
Artifact source is `1f4ad82eb2d577cbec025bea069edaac4176bfcc`; GitHub Actions
run `34335929864` passed both complete verify gates and native launch checks.
Archives are stored under `releases/macos/0.1.8-1f4ad82eb2d5/{arm64|x64}`.
Railway deployment `814fa0b0-dc66-4a91-bd58-73415dfc1a22` succeeded using the
original CLI snapshot. Redeploy rebuilds that snapshot: the new image digest
is `sha256:2f80711438ffce923a255f39d8cfa22c83a90135d1423e2ad4538a078b02c380`.
Compare snapshot provenance, not an assumption that the image digest stays fixed.

Both Darwin architecture feeds return 0.1.8 to 0.1.7 clients and 204 for
0.1.8 or newer. Both actual HTTP archives passed the configured updater-key
signature check, byte count and SHA-256 checks. Public installer catalogue
remained unchanged and `/up` passed. Public Mac DMGs are still unavailable;
this is the user-authorized Tauri-authenticated, ad-hoc Mac beta update.

The updater checks shortly after opening the workspace and every 20 minutes.
The update banner offers Download, then Restart now; no manual Check for
Updates button exists. The active local host stays on 0.1.7 until the user
installs/restarts. Do not terminate the agent's host to force installation.

Mac 0.1.9 adds the live, view-only iPhone connection and supersedes 0.1.8 on
both Mac updater feeds. See [[iPhone Connection]] for setup and release evidence.
