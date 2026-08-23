# Shipping a desktop update

The installed app checks for updates 8 seconds after the workspace opens and
every 20 minutes after that. When a newer build is published it shows a banner
with an **Update now** button; the user downloads it, then clicks **Restart
now**. Nobody has to visit the website again.

The whole system **fails closed**: if anything about a release is incomplete —
no signature, wrong hash, missing file — the feed answers `204 No Content` and
users simply stay on what they have. That is safe, but it is also *silent*, so
follow the checklist rather than assuming a push worked.

## Publishing a release

1. **Bump the version** in `desktop-tauri/src-tauri/tauri.conf.json` (and
   `desktop-tauri/package.json` to match). This is the number the updater
   compares — semver, so `0.1.10` is newer than `0.1.9`.

2. **Run the release workflow** (`.github/workflows/desktop-release.yml`,
   `workflow_dispatch`). It builds, signs, smoke-tests, and prints a job
   summary containing everything step 4 needs.

   It needs two repository secrets, set once:

   | Secret | Value |
   | --- | --- |
   | `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/vibyra-updater.key` |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | empty (the key has no password) |

3. **Upload the artifact** to the release volume, at the path the backend
   expects (`releases/linux/…`, `releases/windows/…`).

4. **Set the backend env vars** from the job summary, per platform. For Linux
   AppImage that is:

   ```
   VIBYRA_LINUX_RELEASE_VERSION
   VIBYRA_LINUX_RELEASE_PATH
   VIBYRA_LINUX_RELEASE_FILENAME
   VIBYRA_LINUX_RELEASE_SIZE
   VIBYRA_LINUX_RELEASE_SHA256
   VIBYRA_LINUX_RELEASE_SIGNATURE   # the .sig contents, verbatim
   VIBYRA_LINUX_RELEASE_NOTES       # optional, shown in the banner
   ```

   The same pattern with `VIBYRA_LINUX_DEB_*` and `VIBYRA_WINDOWS_*` covers the
   other bundles. **`…_SIGNATURE` is the one that is easy to forget** — without
   it the release downloads fine from the website but is never offered in-app.

   Railway rebuilds from GitHub when env vars change; redeploy with `railway up`
   afterwards so the running image is the one you just built.

5. **Verify** — from any machine:

   ```bash
   curl -i https://vibyra-production.up.railway.app/web-api/updates/linux/x86_64/appimage/0.0.1
   ```

   A `200` with a `version`, `url` and `signature` means the release is live.
   A `204` means something in step 3 or 4 is incomplete.

## How it fits together

| Piece | Where |
| --- | --- |
| Poll loop (8s, then every 20 min) | `desktop-tauri/src/lib/useUpdateWatch.ts` |
| Banner and buttons | `desktop-tauri/src/components/layout/UpdateBanner.tsx` |
| Download / install / relaunch | `desktop-tauri/src/ipc/updates.ts` |
| Endpoint + public key | `desktop-tauri/src-tauri/tauri.conf.json` |
| Feed | `backend/app/Http/Controllers/ReleaseUpdateController.php` |
| Per-platform release data | `backend/config/releases.php` |

The app polls
`/web-api/updates/{target}/{arch}/{bundle_type}/{current_version}`. The bundle
type is stamped into the binary at build time, so an AppImage asks for an
AppImage and a `.deb` asks for a `.deb` — they can even sit at different
versions.

## Things worth knowing

- **The private key is unrecoverable.** Lose `~/.tauri/vibyra-updater.key` and
  no existing install can ever be updated again — the public key is baked into
  every shipped binary. Back it up somewhere durable.

- **Existing users need one last manual download.** Builds before this feature
  have no updater and no public key, so they cannot be reached. Only installs
  from this version onward can self-update.

- **AppImage updates need no password; `.deb` updates do.** The AppImage is
  replaced in place (`~/Vibyra.AppImage` is user-owned). A `.deb` install runs
  `dpkg -i` through `pkexec`, so those users get a system password prompt.

- **AppImage self-update relies on the `APPIMAGE` environment variable**, which
  the AppImage runtime sets. Launching the extracted binary directly, or with
  `APPIMAGE_EXTRACT_AND_RUN=1`, breaks the in-place swap.

- **Every update is a full download** — around 157 MB for the AppImage, with no
  deltas. That is backend egress on every user on every release. Most of that
  weight is `bundleMediaFramework: true`; worth revisiting if it is no longer
  needed.

- **Restarting is deliberately a second click.** This window holds live
  terminal sessions, and swapping the binary under a running agent would lose
  work.
