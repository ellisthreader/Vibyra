# Desktop Updates

How a published release reaches a running Vibyra window, and the three
surfaces that can act on it.

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
