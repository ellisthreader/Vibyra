# Boot window + startup updates — research and implementation plan

**Status: plan only. Nothing here is implemented.**

Goal: when Vibyra opens, show a small branded window that says what it is doing,
apply any waiting update there, and then open the workspace. The way Discord
does it.

This document is in two halves: what Discord actually does (researched), and
what we should build (planned, phased, with the traps called out).

---

# Part 1 — How Discord does it

## 1.1 The core insight: three update layers, not one

Most desktop apps have one update path: download installer → restart → done.
Discord splits the app into three independently-versioned pieces, and only the
bottom one ever needs a real restart.

| Layer | What it is | Cost to update |
| --- | --- | --- |
| **Host** | The Electron shell — executable, Electron binaries, `app-1.0.9042/` | Full or delta package, process restart |
| **Modules** | Native binaries: `discord_voice`, `discord_desktop_core`, `discord_krisp`, `discord_rpc`, `discord_utils`, `discord_erlpack`, `discord_spellcheck` | Downloaded to `pending/` while running, swapped on next launch |
| **Client** | The web app JS/CSS — the renderer *is* the web client | Renderer reload. No download, no installer, no restart |

Each module carries its own integer `module_version`, independent of the host
version. `discord_desktop_core` holds the renderer bootstrap, so a large share
of what users experience as "an update" is that one module bumping.

This layering is the whole reason Discord feels like it updates instantly: the
thing that changed is almost never the host.

## 1.2 The startup sequence

1. `Discord.exe` launches **the updater**, not the app. This is why the splash
   appears before the real window — the splash belongs to the updater.
2. The updater runs a state machine, each state rendering a line of text on the
   splash:
   `CHECKING_FOR_UPDATES` → `DOWNLOADING_UPDATES` → `INSTALLING_MODULE` →
   `LAUNCHING`. The failure state is `UPDATE_MANUALLY` — that is the "Update
   Failed" loop people hit when the app lacks write permission.
3. It requests the manifest:

   ```
   GET /updates/distributions/app/manifests/latest
       ?platform=win|osx|linux
       &arch=x86|x64|arm64
       &channel=stable|ptb|canary|development
       &install_id=<uuid>
       &platform_version=<os version>
   ```

   Response:

   | Field | Meaning |
   | --- | --- |
   | `full` | One package: `{host_version: [1,0,9042], package_sha256, url}` — Brotli tarball |
   | `deltas[]` | Packages each keyed to a *specific* previous `host_version` |
   | `modules{}` | name → `{module_version, package_sha256, url}` |
   | `required_modules[]` | Which modules block launch |
   | `required_update` | **The forced-update flag** |

   Legacy endpoints being retired: `GET /updates/{channel}`,
   `GET /modules/{channel}/versions.json`,
   `GET /modules/{channel}/{module}/{version}`.

4. If the host is current, the app launches **immediately** and module work
   moves to the background. Modules land in `pending/`; nothing blocks.
5. On Windows the packaging layer is Squirrel: versioned side-by-side folders
   in `%LocalAppData%\Discord\packages`, extracted to a new `app-<version>`
   directory. The old version stays on disk, so a failed update falls back
   rather than bricking. Discord leaned on this during the 32→64-bit
   migration — *"any error during the transition process would have the app
   simply fall back to the 32-bit build."*

## 1.3 The splash window itself

The splash is a small, frameless, non-resizable, always-on-top, transparent
Electron `BrowserWindow` with no menu and no taskbar presence. It is created
**first**, before any update work starts, so something is on screen within
milliseconds of the process starting.

Its content is deliberately minimal:

- The animated logo (a looping CSS/Lottie animation — it loops rather than
  progressing, so it never implies a duration it cannot deliver)
- **One line of status text**, driven by the state machine above
- A **determinate progress bar only during `DOWNLOADING_UPDATES`**, because
  that is the only state with a known total. Every other state shows the loop
  animation alone
- No buttons at all, except in `UPDATE_MANUALLY`, which offers a retry / help
  link

The main process pipes download progress to the splash over IPC. When the
updater reaches `LAUNCHING`, the main window is created hidden, and the splash
is destroyed only once the main window signals it has painted — so there is
never a moment with no window on screen, and never a flash of an empty
white/unstyled main window.

The important behavioural detail: **the splash is never a gate on nothing.** If
there is no update, it flashes past in well under a second. Users read it as
"the app is starting", not as "the app is making me wait".

## 1.4 The green arrow — updates found *while running*

This is the deliberately-designed half, and the part most apps get wrong.

Discord **stopped force-updating on startup**. Their own change: the desktop
client only auto-updates when the release is flagged mandatory
(`required_update: true`) or when the install has fallen several versions
behind. Otherwise the update is downloaded silently in the background and
surfaced as the **green arrow indicator in the top-right**, which the user
clicks when they choose.

So the arrow does not mean "an update exists". It means **"an update is already
downloaded, verified and staged on disk — click to swap it in."** That is why
clicking it is near-instant: all the work happened while you were using the app.

## 1.5 Delta updates and their sharp edge

Deltas are keyed to `host_version` only — **they carry no architecture
awareness**. Discord hit this head-on during the 64-bit migration: deltas could
not express "same version, different arch", so they shipped a full package and
**bumped the 64-bit version by 100** so it would always compare as newer than
any 32-bit build. Worth remembering if we ever ship multi-arch deltas.

---

# Part 2 — Where Vibyra actually stands

Read before planning, so the plan does not rebuild what exists.

**The in-session updater is complete and good.** It is not the gap.

| Piece | File | State |
| --- | --- | --- |
| Poll loop (8s after mount, then 20 min) | `src/lib/useUpdateWatch.ts` | ✅ |
| Lifecycle store (check/download/restart) | `src/state/updateStore.ts` | ✅ |
| Pure progress + copy rules | `src/lib/updatePolicy.ts` | ✅ |
| Pure Settings copy rules | `src/lib/updateCheckPolicy.ts` | ✅ |
| Update-as-notification routing | `src/lib/updateNotifications.ts`, `useUpdateNotifications.ts` | ✅ |
| Titlebar chip (our "green arrow") | `navUpdateCopy()` in `updatePolicy.ts` | ✅ |
| Manual check, version, up-to-date state | `src/components/settings/SettingsUpdatesPane.tsx` | ✅ |
| Plugin calls | `src/ipc/updates.ts` | ✅ |
| Feed | `backend/app/Http/Controllers/ReleaseUpdateController.php` | ✅ |
| Signing, endpoint, pubkey | `src-tauri/tauri.conf.json` | ✅ |
| Tests | `tests/update{Policy,CheckPolicy,Notifications,Reliability}.test.mjs` | ✅ |

**What is missing, measured against Discord:**

1. **There is no boot window.** `tauri.conf.json` declares one window, visible
   immediately, painted `#0e0f12` until React mounts. The user stares at an
   empty dark rectangle through font loading, CSS parse, account restore and
   session restore, with no indication anything is happening.
2. **Updates are never applied at startup** — the only moment when applying one
   is genuinely free.
3. **Nothing is pre-staged.** `download()` runs only when the user clicks, so
   our titlebar chip means "an update exists", not Discord's "it is already on
   disk". Clicking it starts a ~157 MB download.
4. **No mandatory flag.** The feed has no way to say "this one is not optional".
5. **Stale doc row.** `docs/desktop-updates.md` still points at
   `src/components/layout/UpdateBanner.tsx`, which no longer exists — the
   banner became a notification. Fix while we are here.

## 2.1 The insight that makes this safe

The reason Vibyra's updater makes restart a deliberate second click is sound and
must not be weakened:

> This window holds live terminal sessions, and swapping the binary under a
> running agent would lose work.

**But at boot there are no live sessions yet.** Terminals are spawned and
restored *after* the workspace mounts. Startup is therefore the one moment when
Vibyra can apply an update at zero risk — exactly the window Discord uses.

This plan adds a startup path. **It does not change the in-session rule.**

---

# Part 3 — The plan

Five phases. Each is independently shippable and independently revertible. Do
not merge them.

Constraints that shape every phase:

- **200-line limit** applies to `.ts/.tsx/.rs/.css/.html` under `desktop-tauri/`
  (`scripts/check-desktop-lines.mjs`). The boot HTML and CSS must each stay
  under it.
- **Pure-logic-plus-thin-shell** is the house pattern (`updatePolicy.ts` is the
  model). Every new decision goes in a pure module with a `tests/*.test.mjs`;
  the React/Rust layer stays dumb.
- **`npm run verify`** must pass: lines, knip dead-code, tests, tsc, build,
  rustfmt, clippy, cargo test.

---

## Phase 1 — The boot window (no updater involvement)

Ship the window on its own, so it can be proven in isolation. If Phase 2 is
never built, this phase still fixes the blank-rectangle startup.

### Changes

**`vite.config.ts`** — multi-page build:

```ts
build: { rollupOptions: { input: { main: 'index.html', boot: 'boot.html' } } }
```

**`boot.html`** (new, repo root of `desktop-tauri/`, < 200 lines) — self
contained: inline `<style>`, inline logo SVG, one status line, one progress
bar. **No React, no fonts, no imports.** It must paint from a cold start in one
frame; pulling in the React bundle or `@fontsource-variable/inter` would defeat
the entire purpose. System font stack only.

**`src/boot/bootState.ts`** (new, pure, ~60 lines) — the state machine:

```ts
export type BootPhase =
  | 'starting' | 'checking' | 'downloading' | 'installing' | 'launching' | 'failed';
export function bootCopy(phase: BootPhase, percent: number): { text: string; determinate: boolean }
```

Mirrors Discord's states, mirrors our own `updatePolicy.ts` shape. Tested by
`tests/bootState.test.mjs`.

**`src/boot/boot.ts`** (new, ~120 lines) — the boot entry script. Renders
`bootCopy()` into `boot.html`'s DOM, listens for phase events, tells Rust when
to hand over.

**`tauri.conf.json`**:

```jsonc
"windows": [
  {
    "label": "boot",
    "url": "boot.html",
    "width": 420, "height": 260,
    "decorations": false, "resizable": false, "center": true,
    "alwaysOnTop": true, "skipTaskbar": false,
    "backgroundColor": "#0e0f12"
  },
  {
    "label": "main",
    /* …every existing key unchanged… */
    "visible": false          // ← the only change to the main window
  }
]
```

**`src-tauri/capabilities/boot.json`** (new) — scoped to `"windows": ["boot"]`,
granting only `core:event:default`, `core:window:allow-close`,
`core:window:allow-show`, `core:window:allow-set-focus`. Phase 2 adds
`updater:default` and `process:default` here.

**`src-tauri/capabilities/default.json`** — add `"core:window:allow-show"` if
the main window is to show itself (it already has `allow-show`; confirm at
implementation time).

**`src/components/layout/WorkspaceApp.tsx`** or `src/App.tsx` — on first paint,
emit `app://ready`. Preferably from a `requestAnimationFrame` inside a
`useEffect` after the workspace mounts, so we hand over on a *painted* window,
not a mounted one.

**`src-tauri/src/boot_window.rs`** (new, ~70 lines) — owns the handover: listens
for `app://ready`, shows `main`, closes `boot`. Order matters: show main
*first*, then close boot on the next tick, so there is never zero windows.

### Traps to handle in this phase

| Trap | Handling |
| --- | --- |
| **`close_guard` fires for the boot window.** `on_window_event` in `lib.rs` is registered app-wide, not per-window. Closing `boot` would run the veto path. | Guard the handler on `window.label() == "main"`. This is a real bug the moment a second window exists — do it in the same commit. |
| **`single_instance` focuses a hidden main window.** The plugin callback calls `get_webview_window("main")` and shows it. During boot, that would reveal an unpainted main window. | Focus `boot` if it still exists, else `main`. |
| **Handover never fires.** If React throws before mount, `app://ready` never arrives and the app has no visible window — worse than today. | Hard watchdog in `boot_window.rs`: after 20 s, show `main` and close `boot` regardless. Fail open, always. |
| **Boot flash.** With no update, boot may live 200 ms and read as a glitch. | Minimum visible duration ~600 ms in `bootState.ts`, enforced as pure logic so it is testable. |
| **Dev mode.** `beforeDevCommand` serves `index.html` from Vite at :1420. | Confirm `boot.html` is served by the dev server too (multi-page input handles this); `app:dev` must still work. |
| **CSP.** `default-src 'self'` with `style-src 'self' 'unsafe-inline'`. | Inline `<style>` is already permitted. Inline `<script>` is **not** — `boot.ts` must be a module file, not an inline script. |

### Verification

- `npm run verify` clean.
- `npm run app:dev` — boot window appears, hands over, no flash of unpainted main.
- `npm run app:install` and launch from the desktop entry — the real path, per
  the launch-environment gotchas already documented.
- Deliberately throw in `App.tsx` and confirm the 20 s watchdog opens main
  anyway.

---

## Phase 2 — Apply a staged update at boot

Only after Phase 1 is merged and proven.

### The rule

At boot, **apply an update only if it is already downloaded and verified on
disk.** Never download at boot on the critical path by default — a 157 MB
download in front of a user who wants to open a terminal is exactly the
"Discord stuck on Checking for Updates" experience.

This is what makes Phase 3 (pre-staging) the real payoff. Phase 2 alone will
rarely trigger; that is correct and intended.

### Changes

**`src/boot/bootPolicy.ts`** (new, pure, ~90 lines) — the whole decision:

```ts
export interface BootUpdateInput {
  staged: { version: string } | null;   // already on disk from a prior session
  bundle: 'appimage' | 'deb' | 'nsis' | 'msi' | 'app' | 'unknown';
  mandatory: boolean;                    // Phase 4
  isDev: boolean;
  offline: boolean;
}
export type BootDecision =
  | { kind: 'launch' }                       // nothing to do
  | { kind: 'install'; version: string }     // apply staged package now
  | { kind: 'download'; version: string };   // mandatory only — Phase 4
export function bootDecision(input: BootUpdateInput): BootDecision
```

Tested exhaustively by `tests/bootPolicy.test.mjs`.

**`bootDecision` must return `launch` when:**

- `isDev` — never gate a dev run.
- `bundle === 'deb'` — a `.deb` install runs `dpkg -i` through `pkexec`. A
  polkit password prompt *before the app opens*, unprompted, is unacceptable.
  Deb users keep the in-session path only. **This is a hard rule.**
- `bundle === 'unknown'` — cannot reason about the install mechanism.
- `staged === null && !mandatory`.

**Staging store** — the staged package must survive a process exit. Tauri's
`Update` handle is per-process, so a Phase-3 download must record what it
staged. Small JSON next to the existing session store:

```jsonc
{ "version": "0.2.9", "path": "…", "sha256": "…", "stagedAt": 1756... }
```

Rust side (`src-tauri/src/update_stage.rs`, new) owns read/write/clear. It must
re-verify hash and signature before use — a staged file is untrusted the moment
the process that wrote it exits.

**`src-tauri/src/boot_window.rs`** — runs `bootDecision` inputs, emits phases to
the boot window, applies via `tauri-plugin-updater`, relaunches.

### Traps

| Trap | Handling |
| --- | --- |
| **AppImage `APPIMAGE` env var.** In-place swap needs it; it is absent when running an extracted binary or under `APPIMAGE_EXTRACT_AND_RUN=1`. | `bootDecision` gets an `appimageInPlace: boolean`; false → `launch`. Already a documented caveat; now it must be enforced in code. |
| **Windows NSIS `install()` exits the process.** | Fine at boot. But the boot window must show `installing` and never expect to be closed by us. |
| **A staged package that can never install** (corrupt, wrong version, feed rolled back) would retry every launch — a permanent boot gate. | Clear the stage on any install failure, then `launch`. One attempt, never two. |
| **Offline at boot.** | `bootDecision` short-circuits to `launch`. Staged-install needs no network, so an offline boot can still install a staged package. |
| **Update budget.** Total boot gate must be bounded. | Hard 45 s ceiling on the entire update phase, then launch regardless. The Phase-1 watchdog stays as the outer backstop. |

---

## Phase 3 — Pre-stage in the background (the actual win)

This is what turns our titlebar chip from "an update exists" into Discord's
"it is already on disk — click to swap".

### Change

In `updateStore.ts`, after `check()` finds a release, start `download()`
automatically instead of waiting for a click — **but only** under conditions
that must be pure and tested (`src/lib/stagingPolicy.ts` + test):

- Not on a metered connection (where detectable).
- Not while any terminal is mid-run, if that is cheap to determine — a 157 MB
  download competing with an agent's output is a real regression risk.
- Respecting a new **Settings → Updates toggle**: *"Download updates
  automatically"*, default **on**, off honoured absolutely.

The existing `available → downloading → ready` states already model this
perfectly. `updateNotifications.ts` will need one adjustment: an
auto-started download should surface at tier `busy` but **not** pinned, so a
background download the user did not ask for does not occupy the pinned slot.
The `ready` state stays `ask` and pinned — that is the green arrow.

### Why this matters most

With Phase 3 shipped, Phase 2 stops being rare: the ordinary case becomes
"closed the app last night with 0.2.9 staged, opened it this morning, the boot
window said *Installing update* for three seconds, and the workspace opened on
0.2.9." That is the Discord experience, precisely.

### Trap

Egress. Auto-download means **every user pulls ~157 MB on every release**,
whether or not they would ever have clicked. `docs/desktop-updates.md` already
flags `bundleMediaFramework: true` as most of that weight. **Do not ship Phase 3
before deciding whether that flag is still needed** — this phase multiplies the
cost of leaving it on.

---

## Phase 4 — `mandatory` on the feed

Discord's `required_update`. One boolean that lets a security fix bypass the
"you choose when" rule, while everything else keeps it.

**`ReleaseUpdateController::check()`** — add to the 200 payload:

```php
'mandatory' => (bool) ($release['mandatory'] ?? false),
```

Tauri's dynamic format ignores unknown fields, so old clients are unaffected —
this is backward compatible by construction. New clients read it via the
plugin's raw response, or via a small parallel fetch if the plugin does not
expose it.

**`backend/config/releases.php`** — `VIBYRA_<PLATFORM>_RELEASE_MANDATORY`, per
platform, defaulting false.

**Behaviour:** mandatory is the *only* case where `bootDecision` may return
`download` — i.e. the only case where boot blocks on a network fetch. In
session, a mandatory update escalates the notification tier from `news` to `ask`
but **still never restarts under a running agent without consent**. The
in-session rule does not bend, even for mandatory.

**Docs:** add the env var to the `docs/desktop-updates.md` table and to the
release checklist.

---

## Phase 5 — Layered updates (evaluate, do not build yet)

Discord's biggest lever is that the renderer is served separately from the
shell, so most releases need no installer at all.

For Vibyra this is **not currently recommended**, and the reasons are concrete:

- `frontendDist: "../dist"` bundles the renderer into the binary.
- CSP is `default-src 'self'`; serving the renderer remotely means widening it
  to our own origin — a real reduction in the security posture of a window that
  holds terminal sessions and provider credentials.
- It would make the app require the network to start, which a local terminal
  workspace should not.

There *is* a middle path worth costing later: ship the renderer bundle as a
signed, versioned asset the app downloads into its own data dir and loads from
`file://`, keeping CSP at `'self'`. That gets Discord's "most updates are a few
hundred KB" benefit without the remote-origin cost. It is a large change and
should be its own plan, not a phase of this one.

**Cheaper win available now:** revisit `bundleMediaFramework: true`. Cutting the
AppImage from ~157 MB is worth more, sooner, than layered updates.

---

# Part 4 — What must not break

Explicit non-goals and invariants. Any implementation that violates one of these
is wrong even if it works.

1. **In-session restart stays a deliberate user action.** No phase here changes
   that. Terminals hold live agent work.
2. **The app must always open.** Every gate fails open — watchdog, timeout,
   bundle check, offline check, install-failure clear. There must be no
   reachable state where a broken update feed prevents launch. This is the
   single highest risk of the whole plan and every phase carries a specific
   mitigation for it.
3. **`.deb` never auto-installs at boot.** `pkexec` prompt before the app opens.
4. **Dev runs are never gated.**
5. **Session persistence contract is untouched.** `saveSessionNow(true)` before
   `relaunch()` stays exactly as it is in `updateStore.restart()` and
   `appRestart.ts`. Boot-time install happens before any session exists, so it
   needs no flush — but it must not remove the in-session one.
6. **Boot window loads no React and no webfonts.** The moment it does, it stops
   being faster than the thing it is covering for.
7. **Every new decision is a pure module with a test.** No `if` about update
   behaviour buried in a component or in Rust.

---

# Part 5 — Order, and what to do first

| Phase | Value | Risk | Ship |
| --- | --- | --- | --- |
| 1 — Boot window | High (fixes visible startup) | Low, self-contained | First, alone |
| 2 — Install staged at boot | Medium alone | Medium — the launch-blocking risk lives here | After 1 is proven |
| 3 — Background pre-stage | **Highest** — makes 2 the common case | Medium — egress | After the AppImage-size decision |
| 4 — `mandatory` flag | Operational safety | Low, backward compatible | Any time after 2 |
| 5 — Layered updates | High, long term | High | Separate plan |

**Recommended first commit:** Phase 1 only, plus the two latent bugs it exposes
(`close_guard` firing on non-main windows, `single_instance` showing a hidden
main window) and the stale `UpdateBanner.tsx` row in `docs/desktop-updates.md`.
That commit is independently valuable, has no update-path risk at all, and
proves the window mechanics before anything blocking is built on top.

---

## Sources

- [How Discord Seamlessly Upgraded Millions of Users to 64-Bit Architecture](https://discord.com/blog/how-discord-seamlessly-upgraded-millions-of-users-to-64-bit-architecture)
- [Client Distribution — Discord Userdoccers](https://docs.discord.food/topics/client-distribution)
- [modulocord/reUpdater — open-source reimplementation of `updater.node`](https://github.com/modulocord/reUpdater)
- [PRO-2684/Fuck-discord-auto-update — documents `CHECKING_FOR_UPDATES` / `LAUNCHING` and `splashScreen.js`](https://github.com/PRO-2684/Fuck-discord-auto-update)
- [itsvic-dev/discord-module-downloader](https://github.com/itsvic-dev/discord-module-downloader)
- [molangning/reversing-discord](https://github.com/molangning/reversing-discord)
- [sandeep1995/electron-splash-updater — Discord-style splash for Electron](https://github.com/sandeep1995/electron-splash-updater)
- [Slack / GitKraken / Discord Electron loading screen tutorial](https://dev.to/nicolalc/slack-gitkraken-discord-electron-loading-screen-tutorial-3k5n)
- [nixpkgs #519923 — `UPDATE_ENDPOINT` / `NEW_UPDATE_ENDPOINT`](https://github.com/nixos/nixpkgs/issues/519923)
