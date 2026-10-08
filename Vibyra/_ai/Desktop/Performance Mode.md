---
title: Performance Mode
date: 2026-09-09
updated: 2026-09-09
status: implemented
tags:
  - vibyra/desktop
  - vibyra/tauri
  - performance
  - settings
aliases:
  - Settings Performance
  - Vibyra Performance Mode
related:
  - "[[Tauri Terminal Performance Overhaul]]"
  - "[[Mac Experience And Sessions]]"
  - "[[Vibyra Desktop Memory]]"
---

# Performance Mode

`Settings > Performance` is the home of every "make it faster" control. Two
cards, two different axes — do not merge them:

- **Performance mode** (`performanceMode`, default off). Cross-platform,
  applies instantly, never needs a restart. Changes how much work the app
  does, never which pixels are correct.
- **Graphics mode** (`rendererMode`). Linux-only WebKit compositing path, read
  before the webview exists, so it lands on the next launch. `GraphicsCard`
  returns null when `renderer_policy().configurable` is false, which is every
  non-Linux build — so on macOS and Windows the pane shows one card. See
  [[Tauri Terminal Performance Overhaul]].

The card moved out of `Settings > General` when the section was added; the
`openGraphicsSettings` notification action now opens `"performance"`.

## Single source of truth

`src/lib/performanceMode.ts` owns every behaviour the mode gates. Consumers
call a named function (`perfWatchEnabled`, `activityTickMs`,
`startupPrefetchEnabled`, `backgroundThrottleEnabled`) rather than testing the
boolean, so the Settings copy and the runtime cannot drift. Adding a new effect means adding a function
there and a line to `EFFECTS` in `PerformanceCard.tsx`.

`applyPerformanceMode` stamps `data-performance="on"` on `<html>` from
`settingsStore`'s `applyDocument`, on load and on every write. The paint half
lives in `src/styles/performance.css`, imported **last** in `main.tsx` so it
wins specificity ties.

## What it actually turns off

1. **Decorative motion.** Animations and transitions go to ~0 duration and one
   iteration. Deliberately not `animation: none`: that parks an element at its
   unanimated start state, where a ~0 duration snaps it to the resting
   appearance the design already draws.

   **Eight animations are exempt** and keep their exact authored rate:
   `.auth-spinner`, `.preview-spinner`, `.voice-hud__spinner`,
   `.voice-hud__levels i`, `.vupdate__bar--indeterminate`,
   `.chat-turn__bubble--thinking i`, `.memory-status__pulse`,
   `.integration-status--working i`. A frozen spinner reads as "hung", and
   `vupdate-sweep` ends its cycle translated off the end of its own track, so a
   stopped update bar looks empty. These run only while an operation is in
   flight, so they cost nothing at rest. The durations are restated because
   `revert` drops to the user-agent value (0s), not the authored one — two
   tests keep that honest: one fails if an exemption drifts from its source
   sheet, the other fails if any *new* `infinite` animation is neither exempted
   nor named in the decorative allowlist. Only `pulse-ring` is on that
   allowlist; its loop is opacity-only and the dot colour carries the state.
2. **Blur.** `backdrop-filter: none` everywhere. On macOS this is the single
   most expensive thing in the chrome — its own compositing layer, re-sampled
   every frame. Every blurred surface here already sits on a near-opaque
   background.
3. **Elevation.** `--e-menu` / `--e-panel` are redefined to one tight shadow
   rather than blanket `box-shadow: none`, so menus and popovers still read as
   separated. Both themes are redefined.
4. **The perf watchdog** (`usePerfWatch`) stops entirely. Its 1 Hz drift timer
   keeps the main thread from ever settling, and its 15 s native sample can
   walk the whole process table (`perf.rs` `add_children`). Its only output is
   advice to do what this mode already did, so it stops rather than slowing.
5. **Activity ticker** 1.5 s -> 3 s. The ceiling is `activity.ts`'s 5 s working
   window and 2.5 s prompt-quiet threshold: a slower tick reports a state late,
   a tick above those would skip one. `tests/performanceMode.test.mjs` asserts
   the relationship.
6. **Startup prefetch.** The screenshot-editor chunk is not warmed at launch;
   it loads on first use.
7. **Output while the window is off screen** (`useBackgroundThrottle.ts` +
   the pure `backgroundThrottlePolicy.ts`). Panes the store calls `visible` are
   sent to Rust as `Hidden` for as long as `document.hidden` is true, so a
   minimised window flushes on `hidden_interval` (250ms) instead of per 16ms
   tick. Nothing is lost: the buffer coalesces and an overflow resyncs from the
   scrollback ring — the path non-active projects already take.

   Keyed off `document.hidden`, **never focus**: a visible-but-unfocused window
   (Vibyra beside an editor) is still being watched and keeps the full rate.
   The hook never writes pane visibility into the store, and restores only the
   panes it demoted that are still running and still `visible` — so a pane
   closed, exited or hibernated while the window was away is left alone.

Verified with headless Chrome computed styles: `0.78s`/infinite ->
`1e-05s`/`1`, `blur(18px)` -> `none`, two-layer 48px shadow -> one 8px.

## Deliberately left alone

- **WebGL stays attached.** On macOS `softwareCompositing` is false, so
  `attachRenderer` uses the WebGL addon, which is the *fast* path. Dropping to
  the DOM renderer would cost performance, not save it.
- **Scrollback, saved sessions, notifications, sounds, terminals.** Nothing
  the user would notice as missing function.
- **The 10s Codex identity probe** (`sessionIdentity.ts` -> `ps`/`lsof`, Mac
  only, and only while a Codex pane runs). ~36ms per poll, so ~0.4% of a core.
  Slowing it makes `agentSessionId` staler, and resume reads that value
  directly — not a trade worth taking for the saving. See
  [[Mac Experience And Sessions]].
- **Network polls** — the 20-minute updater check and the 5-minute OpenRouter
  `model_watch`. Each is one small request off the UI thread; disabling them
  removes a feature and saves nothing measurable.

## Checks

`tests/performanceMode.test.mjs` covers the gates, the DOM flag, the two
animation invariants above, and asserts the stylesheet targets the attribute
the runtime sets — the wiring is a data attribute, so a rename on either side
would otherwise fail silently with no type error.

`tests/backgroundThrottle.test.mjs` covers the demote/restore selection: only
running on-screen panes are demoted, and restore touches nothing the hook did
not demote and nothing that changed while the window was away.
