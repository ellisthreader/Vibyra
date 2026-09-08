# Mac desktop publication

Source branch: `release/0.6.3-macos`, based on published Desktop 0.6.3.
The originating safe-mode workspace is 0.2.8; do not ship that older desktop.
The release worktree is `/tmp/vibyra-macos-release`.

## Build and acceptance

Dispatch `desktop-release.yml` on the release branch with `macos_only=true`.
`macos_validation=true` builds ad-hoc signed **validation-only** artifacts;
these are not approved public packages. The default false requires Apple
credentials, notarization, a stapled app ticket and Gatekeeper acceptance.
Both Apple Silicon (`macos-14`) and Intel (`macos-15-intel`) run the full
frontend/native gates, build a DMG and updater archive, mount the DMG, copy the
app, verify architecture/signing/minimum OS and check it stays running.
The supported minimum is macOS 12.0. A launch smoke test is not exhaustive
interactive acceptance of terminals, authentication, agents or screenshots.

GitHub repository secrets needed for a trusted public build:

- `APPLE_CERTIFICATE`: base64 Developer ID Application certificate + private key (.p12)
- `APPLE_CERTIFICATE_PASSWORD`: export password
- `APPLE_SIGNING_IDENTITY`: Developer ID Application signing identity
- `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`: notarization
- `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: updater signing

Use GitHub's secrets interface; do not put credentials in source, logs or chat.
Apple signing credentials were absent from repository and production-environment
secret names on 8 September 2026; the updater key was present.
See https://v2.tauri.app/distribute/sign/macos/ for Apple certificate setup.

## Publish

1. Require both **notarized** CI artifacts from one exact source SHA. Read each
   `<arch>.metadata.json`, verify the downloaded sizes/SHA-256 and signed updater
   payload against the shipped public key. Never publish validation-only output.
2. Deploy the reviewed backend Mac updater changes with the website build.
   Preserve production release storage and all Windows/Linux metadata.
3. Upload each verified DMG and `.app.tar.gz` to the release volume before
   changing metadata. Recheck hashes and byte counts on the server.
4. Configure `VIBYRA_MACOS_ARM64_RELEASE_*` and `VIBYRA_MACOS_X64_RELEASE_*`
   (`VERSION`, `PATH`, `FILENAME`, `SIZE`, `SHA256`, `NOTES`, `PUBLISHED_AT`)
   from the **installer** record. Keep `MINIMUM_SYSTEM_VERSION=12.0`.
5. Configure each matching `VIBYRA_MACOS_<ARCH>_UPDATE_*` (`PATH`, `FILENAME`,
   `SIZE`, `SHA256`, `SIGNATURE`) from the **updater** record. Clear config cache
   or deploy the staged metadata through the existing release procedure.
6. Fetch `/web-api/releases`; both Mac variants must be available. Download
   `/downloads/macos-arm64` and `/downloads/macos-x64` and verify actual DMG
   bytes, filenames, checksums and attachment headers.
7. Check `/web-api/updates/darwin/{aarch64,x86_64}/{app,unknown}/{version}`:
   older clients get 200 pointing to `/downloads/macos-<arch>/update`; current
   and newer clients get 204. Verify the archive download and signature.
8. On both Mac architectures, install from a browser download and test a real
   older-client update, account login, a terminal and an agent run before
   claiming Windows/Linux feature parity. Confirm both links in `/downloads`.

DMG signatures and updater signatures are different concerns. Tauri's macOS
updater installs a signed `.app.tar.gz`, never the website's DMG. The existing
marketing and portal cards already render Apple Silicon and Intel links as
soon as the backend advertises intact installer files.

## Local checks

From `backend/`, run `composer install`, copy `.env.example` to `.env` only in a
fresh isolated checkout, `npm ci && npm run build`, then:

```sh
php artisan test --filter='MacDesktopUpdateTest|DesktopUpdateFeedTest|WebsiteReleaseAccessTest|WebsiteDownloadCatalogTest'
vendor/bin/pint --test app/Http/Controllers/ReleaseDownloadController.php app/Http/Controllers/ReleaseUpdateController.php app/Services/ReleaseArtifact.php config/macos-updates.php tests/Feature/MacDesktopUpdateTest.php
```

These passed: 23 tests / 148 assertions, including independent DMG and archive
bytes for both architectures, missing/corrupt/unsigned archive rejection and
existing Windows/Linux behavior. Website build and PHP style passed. Native
Mac validation is tracked by GitHub Actions; no Mac production upload or
metadata activation has occurred.

The implementation adds `screenshot_capture_macos.rs`: the pointer's display
is selected through CoreGraphics, Screen Recording access is requested only
on an explicit capture, and macOS supplies the PNG through `screencapture`.
The existing crop/annotation/Copy/Save editor consumes the same RGBA contract.
Interactive acceptance must cover denied/granted permission, Retina and multiple
monitors, optional window hiding and both export actions.

The first Mac native gates exposed a noncanonical temporary-folder test fixture
and real file-watching failures. Watch roots now canonicalize and FSEvents uses
one recursive root stream instead of restarting descendant streams on renames.
Five file-watcher tests and the protected metadata test passed on Linux after
the repair. Mac acceptance is in the latest CI run on the branch.
