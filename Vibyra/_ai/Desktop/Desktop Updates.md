# Desktop Updates

Latest delivery: [[Desktop/Release 0.6.3]] covers Agent teammate reliability,
routine schedules, signed Windows/Linux publication and a verified old-client
upgrade. Earlier cross-surface delivery: [[Desktop/Release 0.6.1]].

How a published release reaches a running Vibyra window, and the three
surfaces that can act on it.

## Missing changes after publication

For the cross-worktree inventory, read
`docs/audits/unpublished-changes-2026-09-06.md` at the repository root (CSV
and source-evidence JSON alongside it). It separates dirty Agent/iOS work,
pending release/maintenance changes, and older work already shipped through
cherry-picks or replacement implementations. Refresh the feed before reuse.

Compare the public feed, CI source SHA, installed artifact checksum, and the
feature worktree's working files separately. A merged branch tip does not
include that worktree's uncommitted modifications or untracked source files.
On 2026-09-06, published 0.5.0 included the committed Agent 0.4.3 baseline,
but the newer task history/recovery/provider implementation remained dirty in
`codex/agent-page-completion` at terminal worktree `vibyra-1a062ef22f2-0`.
Start with that worktree's `docs/implementation/agent-page-completion.md`;
preserve its changes and review package/platform validation before integration.
0.5.0 changed desktop version/changelog only relative to 0.4.4. Separately,
0.5.1 run `34042433769` failed its aggregate gate because tracked 0.5.0
artifacts produced six metadata files instead of three. Cleanup commit
`c2e61e0` removes/ignores `desktop-tauri/release-set/`; verify a new CI run and
the live feed before treating that fix as published. Neither a version bump
nor that cleanup incorporates the dirty Agent implementation.

## Shape

The updater is `@tauri-apps/plugin-updater` against the endpoint in
`src-tauri/tauri.conf.json`:
`…/web-api/updates/{{target}}/{{arch}}/{{bundle_type}}/{{current_version}}`.
The Rust plugin makes the request over reqwest, so the window CSP never
applies. A 204 means "nothing new" and is the common answer.

`useUpdateWatch` polls: once 8 s after launch, then every 20 minutes.

## Two independent state machines

`updateStore` deliberately tracks two things that are easy to conflate:

- **`status`** — the release lifecycle: `idle → available → downloading →
  ready → installing`, plus `error` / `restartError`. Only this drives the
  banner and the titlebar chip.
- **`checkState`** — the *check request itself*: `idle → checking → done |
  failed`, alongside `checkError` and `lastCheckedAt`.

Keeping them apart is the whole point. A check that fails must never make the
banner announce a version that does not exist, but it also must not vanish —
so it lands in `checkState` where Settings can show it. Anything that gates a
user-facing update surface on `checkState` is a bug;
`tests/updateReliability.test.mjs` asserts neither component references it.

## Three surfaces

1. **`UpdateBanner`** (in `WorkspaceApp`) — the announcement. Respects
   `dismissed`, so it shows once per version. `dismissed` is in-memory, so a
   relaunch brings it back.
2. **`UpdateNavAction`** (in `TitleBar`) — a compact chip that deliberately
   ignores `dismissed`, so a live release stays reachable after the banner is
   waved away. Gated through `navUpdateCopy`, which returns null while idle.
3. **`SettingsUpdatesPane`** (Settings → Updates) — always available, whether
   or not a release exists. Shows the installed version from `getVersion()`,
   a relative "last checked" line, and forces a check on demand. This is the
   only surface that can say "up to date" or "the check is failing"; without
   it those two states are indistinguishable, because the other two render
   nothing at all when `status` is idle.

`updateCheckPolicy.ts` holds the pure table mapping (status, checkState) to
one headline, one detail and at most one action (`check` / `download` /
`restart`). A live release always outranks the check that found it, so status
branches are evaluated first.

## Download and restart are separate on purpose

This window owns live terminal sessions. Nothing is swapped out until the user
presses restart, and `restart()` calls `saveSessionNow(true)` first, because
`relaunch()` exits the process outright and never raises the window close
event that normally flushes scrollback.

## Checks

`npm run typecheck`, `npm test` (see `tests/updateCheckPolicy.test.mjs` and
`tests/updateReliability.test.mjs`), `npm run lines`, `npm run check:dead-code`.

## Published 0.4.3

Vibyra 0.4.3 superseded the live 0.4.2 release on 2026-09-03. The exact
signed source is commit `4abe89647205ce9bfb2e94c892b50112a3939f41` and
annotated tag `v0.4.3` on `release/0.4.3`. GitHub Actions run `33745055315`
passed the complete frontend/Rust gates, Windows NSIS install/launch, AppImage
launch, Debian install/launch, checksums, updater signatures, metadata, and the
aggregate release-set gate. The same commit was verified with `npm ci` and the
full `verify` in a clean worktree before dispatch.

Railway production deployment `dd118a0c-b5fe-40de-999d-7dad865d87f7` was
pushed from a clean worktree of `release/0.4.3` linked to the `Vibyra`
service (never from `~/Desktop/Vibyra`, which sat at 0.2.8), with the portal
bundle rebuilt first. It published all three release records:

- Windows NSIS: 8,182,069 bytes, SHA-256
  `7d925e24cfd60f3ff4435cd7be659952dcc38b25f6d43691563510776064aa06`.
- Linux AppImage: 99,105,272 bytes, SHA-256
  `d5f596629b99813130efc4947fcdd6957096b3aa45b58168342e1924cfa7cada`.
- Debian package: 11,357,882 bytes, SHA-256
  `add68ec6a295470e7e61d16e8f99f884badc5de3432a49331b2fabacd25fa1a4`.

The feed served 0.4.3 about 150 s after `railway up`: all three updater
routes returned 200 with version 0.4.3 for a 0.4.2 client and 204 for a 0.4.3
client, and `verify-release.mjs feed` passed. The desktop bundle carries the
0.4.3 What's New notes (`changelogContent.ts`, with older releases moved to
`changelogArchive.ts`); `allowUnmarkedLaunch` is false, so only an install the
updater marked pending sees them.

What shipped: Agent and Chat Mode un-gated; the Decisions queue fed by a real
Claude permission bridge (bridged turns run `--permission-mode manual`); every
Agent screen rebuilt on the shared design system; the event wire-format fix;
orphaned cards invalidated at startup; and the gate hardening a pre-release
review forced (shell classifier fails closed on `find -exec`, `$(...)`,
backticks and `&`; read-only subjects are refused writes; an error boundary
around each un-gated mode; bounded listener). See `Agent Mode As Built.md`.
