---
title: Incident - GPU Mode One Character Behind
date: 2026-08-25
updated: 2026-08-25
status: permanent
severity: high
importance: critical - read before touching graphics, renderer policy, or perf notifications
tags:
  - vibyra/desktop
  - incident
  - postmortem
  - performance
  - graphics
  - never-again
aliases:
  - One Character Behind Incident
  - NVIDIA Accelerated Incident
  - Graphics Promotion Incident
---

# Incident — GPU Mode Made Every Terminal Type One Character Behind

> **⚠ IMPORTANT — permanent incident record.** This is the incident where the
> app *talked itself into* its own worst configuration, had no way back, and
> no gauge showing it. Read the [[#Never again — the rules]] section before
> changing anything in `renderer.rs`, `rendererPolicy.ts`, `perfGuard.ts`,
> or any notification that changes a setting. Fixed and shipped in **0.2.5**.

## What the user saw (2026-08-23 → 2026-08-25)

- Every terminal, in every project, typed **one character behind**. The last
  keypress never appeared until the *next* event arrived. Backspace walked the
  same one-behind ledger. It felt like input lag but was wiggle-immune —
  moving the mouse never flushed it.
- The whole app felt "in the drain": the WebKit renderer process burned
  **50–70% of a CPU core sustained** (65–94% under agent load) with ~750 MB
  RSS, on a workload that costs **7–8%** on the correct path.
- Ellis reasonably believed the machine was on "the lowest mode for
  performance". It was on the highest-risk one.

## What was actually happening (the mechanism)

`rendererMode` was `"accelerated"` in `settings.json`. On this machine
(GTX 1080, proprietary NVIDIA driver, X11) that removes
`WEBKIT_DISABLE_DMABUF_RENDERER`, so WebKit composites through its DMA-BUF
path, and the frontend then trusted WebGL, so xterm rendered terminals into a
WebGL canvas.

On NVIDIA + WebKitGTK-DMA-BUF, **the xterm WebGL canvas presents exactly one
draw late**: every delivery paints the *previous* delivery's content. The
newest echo is drawn into the canvas within milliseconds but sits
unpresented until the next PTY delivery pushes it out. A turn-end redraw was
recorded sitting invisible for ~45 seconds. Each repaint also cost ~5 ms of
CPU instead of ~1.2 ms — WebGL loaded but was not actually accelerating
(nvidia-smi showed the GL context at 0% utilization).

Proof that pinned it: a screen recording where a typed `z` never painted for
4.7 idle seconds and then appeared as `z` (not `zq`) the instant `q` arrived;
`/proc` thread-wake counters proving the Rust delivery path (writer → reader →
flusher, with its 250 ms heartbeat) could not be holding data; and a
MiniBrowser triple A/B on the same WebKit 2.52.3 + DMA-BUF — plain DOM
instant, raw WebGL instant, **xterm+addon-webgl rendered nothing at all**.
The defect is specifically *xterm-webgl × WebKitGTK-dmabuf × NVIDIA*.

## How the app got into that state — the real root cause

**Nobody opened Settings. The app did it to itself.**

1. On NVIDIA, Automatic correctly runs CPU (shared-memory) compositing — the
   measured-fast path here.
2. The performance watchdog (shipped in `d78b03a`, the night of Aug 23–24)
   saw heavy agent streaming saturate the renderer for ~4 s, attributed the
   stall to "compositing", and fired a notification: *"Auto detected slow
   terminal rendering — **Allow GPU next launch**."*
3. One click set `rendererMode: "accelerated"`. The next launch was broken.
4. **There was no way back.** On the GPU path the watchdog could only say
   "your machine is under load" — it never offered the reverse switch, the
   Settings hint even admitted "can freeze on some NVIDIA setups", and
   nothing anywhere displayed which renderer was actually live. A one-way
   ratchet into the worst mode.

Why diagnosis took a forensic hunt: no UI surface and no log line reported
the live compositing path or terminal renderer; the in-app latency probe ran
under Xephyr, where the policy picks the DOM renderer, so it could never see
the dmabuf+WebGL combination; and the symptom was identical to the (already
fixed) 0.1.9 input-queue bug, which pointed everyone at the delivery path.

## Fixed in 0.2.5 — three independent layers

1. **Unreachable:** `webglIsTrustworthy` refuses WebGL on NVIDIA sessions
   even under accelerated compositing. No Settings value can reproduce the
   bug any more.
2. **Self-healing:** startup (`renderer_heal.rs`, before the webview exists)
   rewrites a promoted `accelerated`-on-NVIDIA install back to `auto` exactly
   once (`rendererAccelHealDone` marker), announces it in-app, and never
   fights a later explicit choice. Verified by booting the actual release
   AppImage against seeded configs.
3. **Symmetric watchdog:** the GPU promotion offer never fires on NVIDIA,
   and when the machine struggles *on* the forced GPU path it offers
   **Back to Automatic next launch** (`revertToAutoGraphics`).

Plus visibility so silent misconfiguration is impossible: **Settings →
Performance** now shows the live truth (compositing path, terminal renderer,
app CPU, renderer CPU, memory, streaming panes) — the numbers the watchdog
always measured but never displayed.

## Never again — the rules

1. **No one-way ratchets.** Any automated or one-click change to a setting
   MUST ship with the symmetric path back, detected under the same
   conditions. If the app can suggest a mode, it must be able to notice that
   mode failing and suggest the way out.
2. **Never recommend a mode the hardware is known to run worse.** A
   recommendation must be gated on evidence for *this machine* (detection or
   measurement), not on a generic "GPU = faster" prior. On NVIDIA + WebKitGTK
   the GPU path is the slow one.
3. **The active path must be visible.** Any internal mode that changes
   behaviour this much (compositing path, terminal renderer) must be shown in
   the UI (Settings → Performance "Right now" card). If a new mode is added,
   extend that card in the same change.
4. **One-behind AT REST = presentation, never delivery.** If the last typed
   character never appears without another event, stop auditing the
   input/flusher path: the flusher's 250 ms heartbeat makes it impossible for
   Rust to hold visible data that long. Go straight to renderer/compositor.
5. **Measure on the real configuration.** Xephyr sessions resolve to the DOM
   renderer, so probes run there can never see dmabuf/WebGL bugs. A perf
   claim about a renderer path must be measured on that path.
6. **Do not "optimize" the CSP.** Tauri's documented tip of allowing
   `ipc:`/`http://ipc.localhost` in connect-src would silently break
   keystroke ordering. `tests/ipcOrdering.test.mjs` is the tripwire — if it
   fails, someone is about to reintroduce the 0.1.9 bug class.

## Links

- Full engineering history and measurements:
  [[Tauri Terminal Performance Overhaul]]
- Release that shipped the fix: 0.2.5 (`release/0.2.5`, commit `fab06a2`),
  publish record in [[Website Accounts And Downloads]]
- Settings surface: `desktop-tauri/src/components/settings/SettingsPerformancePane.tsx`,
  heal: `desktop-tauri/src-tauri/src/renderer_heal.rs`,
  policy: `desktop-tauri/src/lib/rendererPolicy.ts`, watchdog: `perfGuard.ts`
