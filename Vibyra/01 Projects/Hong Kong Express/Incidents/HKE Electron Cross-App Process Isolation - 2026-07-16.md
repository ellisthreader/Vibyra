---
title: HKE Electron Cross-App Process Isolation - 2026-07-16
date: 2026-07-16
tags:
  - hke
  - incident
  - electron
  - startup
  - windows
status: resolved
---

# HKE Electron Cross-App Process Isolation - 2026-07-16

## What happened

Opening Hong Kong Express showed a startup error and appeared to coincide with
the Vibyra Electron window closing. Multiple Electron applications and HKE
verification processes were running at the same time.

## Exact user-facing path

- Desktop and pinned `Hong Kong Express.lnk`.
- Legacy `Homegrounds.lnk`.
- Launcher: `/home/ellis/Desktop/HKE/launch-homegrounds.ps1`.

## Root cause

The HKE launcher cleanup loop used `$processId`. PowerShell variable names are
case-insensitive, so this collides with the read-only automatic `$PID` and can
abort the launcher during stale-process cleanup. The Hong Kong Express desktop
and pinned shortcuts also invoked `electron.exe` directly, bypassing the
guarded launcher. HKE did not isolate its Electron `userData` directory or
enforce a single HKE instance.

No HKE source path was found that intentionally stops Vibyra. The durable
boundary is therefore strict ownership: cleanup may stop only processes whose
executable path or command line belongs to the HKE workspace.

> [!important] Required lesson
> Reproduce the exact user action and exact entry point first. Backend health,
> route status, or a different launcher does not prove the user-facing path
> works.

## Fix applied

- Replaced the reserved `$processId` loop variable with `$ownedProcessId`.
- Added `Test-HkeOwnedProcess` so cleanup checks the HKE workspace path before
  stopping a process.
- Assigned HKE its own `Hong Kong Express` Electron profile.
- Added a single-instance lock; a repeated launch focuses the primary HKE
  window.
- Routed the desktop, Homegrounds, and pinned HKE shortcuts through the guarded
  PowerShell launcher.

## Regression guard

`scripts/check-checkout-regressions.mjs` asserts the isolated Electron profile,
single-instance behavior, HKE-owned cleanup predicate, and absence of the
reserved `$processId` loop.

## Verification

- `node --check electron/main.cjs` passed.
- PowerShell parser validation of `launch-homegrounds.ps1` passed.
- `npm run check:checkout-regressions` passed.
- HKE served `hong-kong-express-desktop-v1` from its live backend.
- Vibyra Electron PID `24524` and HKE Electron PID `38168` ran together.
- A second HKE launch exited cleanly while both primary PIDs remained alive.
- Desktop and taskbar shortcut targets, arguments, and working directories were
  inspected after repair.

## Prevention checklist

- Inspect the exact desktop and pinned shortcuts before debugging internals.
- Never kill all `electron.exe` or `node.exe` processes.
- Confirm ownership by workspace-rooted executable path or command line.
- Avoid PowerShell variable names that collide with automatic variables.
- Give every Electron app a unique profile and app identity.
- Verify two Electron apps live together, then launch HKE a second time.

Related: [[Hong Kong Express]] · [[HKE Desktop Startup Port Collision - 2026-07-15]]
