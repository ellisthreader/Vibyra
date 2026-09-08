# Release 0.6.0

Published 6 September 2026. The full 28-group delivery ledger is
`docs/releases/0.6.0-publication.md`, with CSV and sanitized evidence alongside it.

- Desktop Windows NSIS, Linux AppImage and Debian: tag `v0.6.0`, source
  `d4b36c8f573fb0f74ffa42c01bda01a8f5192748`, package run `34045947817`.
- Backend exact-source deployment: `2decc8ab-307a-4a70-a3a9-ddaca7ab51f2`.
  Public hashes, billing/model source hashes and all 27 updater probes passed.
- A normally mounted isolated 0.5.0 AppImage installed 0.6.0 and relaunched
  into the verified native binary. The local stable launcher now matches 0.6.0;
  active user workspaces were preserved and need a normal restart to load it.
- Agent tasks/history/results/recovery, tightened approvals/access, drafts,
  archive restoration, routines/handoffs and Astra are in this release.
- Standalone Host: signed Windows/Linux `v0.6.0-host-preview`, source
  `be7d78052f5ccb5fea7ffda9b06b7d6c1eeeaf6a`, run `34046463544`.
  Linux CLI is installed as `~/.local/bin/vibyra-host`; it is not auto-started.
- New client: `https://vibyra.expo.app`; local and hosted UI journeys passed.
  `mobile/` is separate from the legacy root `src/` application.
- Native iOS simulator build passed in Expo project `@xellis/vibyra` (project
  ID `c009e48d-4c3b-47b9-bcd6-2db120d2596c`). Physical iPhone distribution
  awaits Apple signing and device qualification. Desktop-to-Host chat sync
  and public self-service relay enrollment remain unfinished. macOS Desktop
  is not a current release target. Do not call every software surface complete.
- Backend/mobile policy/dependency CI passed; full-history secret scanning is
  still red on older findings. The 0.5.0-to-candidate scan found no new leaks.
  See the ledger for moderate Expo dependencies and other evidence limits.

Start future desktop release work from the published tag, preserving dirty
worktrees. Source HEAD, dirty files, signed CI output, installed/running binary
and deployed metadata are separate states. The 0.5.1 failure was stale tracked
installers in `release-set`; keep artifact downloads outside source control.
Gate Unix-only imports as well as tests for Windows Clippy. For EAS, inspect
the upload archive and include generated transport/terminal assets without
local logs or backend data. The VibyraObsiden skill routes these checks here.

Railway's displayed Vibeza repo name redirects to Vibyra; it was not the cause
of the missing Agent work. Production publishing remains a staged operation:
verify signatures, hidden uploads, remote hashes, atomic filenames, all 24
metadata values with `--skip-deploys`, then one exact-source deploy and probes.
