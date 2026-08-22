# Desktop - Projects And Preview

Read this for Vibyra Desktop (`desktop-tauri/`) project workspaces and the
in-app Preview surface.

## Rust/Tauri Workspace Preview (2026-08-11)

The new Rust desktop lives in `desktop-tauri/`. An open project now has a
keyboard-accessible `Terminals` / `Preview` mode bar in `ProjectWorkspace.tsx`.
Preview uses the full workspace while the terminal stage stays mounted and its
native PTY visibility is throttled. The renderer keeps the chosen target per
project and a bounded 80-entry viewport store per project + target. Its device
catalog uses calibrated CSS viewports across phones, foldables, tablets,
laptops, desktop displays, TVs, signage, and custom dimensions; DPR is shown as
a reference because the iframe does not emulate physical device DPR.

`vibyra-core/src/preview/` owns read-only bounded target detection, exact launch
disclosure, localhost-only static/dev services, readiness/log state, streamed
static assets with byte ranges, and tracked process-group cleanup. Inspection
never starts a process. Only `preview_start` may execute after the visible Run
action, and it re-detects the target first. Start/stop transitions are
serialized so target or project switches cannot orphan a late child; Stop and
manager drop terminate only tracked groups. Tauri permits only localhost frames
through CSP. Validate with `npm --prefix desktop-tauri run build`,
`npm --prefix desktop-tauri run core:test`, and a full Tauri Cargo check using
the repo's Linux dev shim when system GTK pkg-config metadata is unavailable.

Rust Preview services are keyed by a normalized absolute lexical project root
plus target, so multiple targets can stay live and a deleted project directory
can still be stopped. The renderer keeps target-scoped status and request
generations, serializes status polls, and does not stop a running service merely
because another target is selected; failed or timed-out services must clear
their URL. Multi-process recipes reserve every port before spawning and hold
each listener until its corresponding child starts. Manifest reads are capped
at 1 MiB, child output is consumed in fixed chunks with bounded logical lines,
and package scripts must directly invoke the detected browser framework rather
than merely declaring its dependency; shell backgrounding with `&` is rejected.

The localhost static service caps active connections, request headers, and
read/write time, while still accepting fragmented headers and serving byte
ranges. Tauri Preview commands run blocking filesystem, process, and readiness
work off the invoke thread. Common nested roots include `app`, `mobile`,
`apps/mobile`, `packages/app`, and `packages/mobile`. The renderer catalog has
47 calibrated presets, and live checks cover its laptop centering and the
960x600 workspace layout without approving a project command.
