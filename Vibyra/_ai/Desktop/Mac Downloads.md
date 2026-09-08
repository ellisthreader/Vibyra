# Mac Downloads

The marketing and portal download cards already support separate Apple Silicon
and Intel DMG links, driven by `/web-api/releases` availability. Do not replace
integrity gating with hardcoded active links. The published 0.6.3 feed has no
Mac artifacts; this task has not activated Mac production downloads.

Implementation branch: `release/0.6.3-macos`, worktree
`/tmp/vibyra-macos-release`, based on the published desktop source. The originating
safe-mode worktree contains older 0.2.8 desktop code and must not be released.
See `docs/releases/macos-publication.md` on the implementation branch.

`desktop-macos.yml` builds separate ARM64 and Intel packages on native runners,
called through `desktop-release.yml` with `macos_only=true`. Validation-only
builds use ad-hoc signing and must not be treated as trusted public installers.
An explicitly labelled ad-hoc beta can be promoted after native install/launch
checks, with `notarized=false` and the macOS Open Anyway instructions.
Apple-notarized publication needs a Developer ID Application certificate and Apple
notarization credentials, which were absent from GitHub secret names during
this task. Updater signing is separate and its key already exists.

Browser installs use `/downloads/macos-{arm64,x64}` DMGs. Tauri updates require
`.app.tar.gz` archives; never serve the DMG or its signature as an update.
The implementation adds `config/macos-updates.php` and
`/downloads/macos-{arm64,x64}/update`, with independent hashes, sizes and updater
signatures. The shared artifact gate also checks architecture matches the route.

Validation: 23 focused backend download/catalog/update tests (148 assertions),
PHP style, website build and six release-contract tests passed. Native Mac gates
run in CI; interactive Mac feature parity and a real older-client update require
separate acceptance. The implementation replaces the original unsupported Mac
screenshot stub with CoreGraphics pointer-display selection, the macOS capture
command and an explicit Screen Recording permission request. Real permission,
Retina/multi-monitor and screenshot-editor acceptance remain unverified.

Native Mac CI exposed `/var` versus `/private/var` event-path mismatches and
FSEvents stream restarts while descendant watches were re-registered. Watcher
roots now canonicalize; Mac uses one recursive root stream with the existing
ignored-path filter. Keep the symlink-root regression and directory-rename
checks. Agent grant fixtures must use canonical roots, as production grants do.

The VibyraObsiden skill routes Mac publication to this note and the release guide.
