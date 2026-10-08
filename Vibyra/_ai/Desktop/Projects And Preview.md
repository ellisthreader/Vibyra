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

On macOS, accepted sockets inherit the static listener's nonblocking mode.
`static_connection::serve` must explicitly switch each worker socket to blocking
mode before setting its bounded timeouts; otherwise split request headers fail
with WouldBlock and the connection resets. Keep the fragmented-header test in
`preview/tests_static.rs` in the native Mac validation gate.


Native Preview platform gates: dispatch `desktop-nonmac-validation.yml` on the
same frozen source as the Mac release workflow. It is registered on default
main27af5db0 (workflow371060173). Windows/Linux run full verify/all-target
Clippy; Linux additionally exercises actual native IPC under dbus/Xvfb.
Diagnostic receipts are retained, with no signing secrets or artifact publication.
See the Preview diagnostics skill for dispatch and physical OS test boundaries.


Linux full native verification runs under dbus/Xvfb because Preview Run requires
X11 availability; the actual WebKit IPC fixture remains a separate later gate.
Queued native PTY and Noise regressions use fixed native Windows/Unix shells,
without disabling permission/revocation assertions. Git byte fixtures disable
repo-local autocrlf, and AppImage escaping uses Linux paths even in Windows tests.
Positive attached-listener discovery is expected for the fixture's own cwd on
all three desktop platforms. See the Preview diagnostics skill for these gates.


For a latched pre-input focus regression, synchronize on the fake's pending focus
delivery and its exact 60 ms deadline before releasing the old read. The input log
is written before delivery; elapsed time from that receipt can race a descheduled
tap thread. Retain the original 400 ms bound and one-reader/freshness assertions.

Mac release gates set RUST_TEST_THREADS=1 for full npm verification; the reused
Mac job previously limited test cases to two threads. Serial cases reduce fixture
competition while all tests, 400 ms assertions and explicit in-test race threads
remain active. A bounded read cannot prevent an external host scheduling pause;
the exact CI descheduling cause remains unmeasured. Keep Linux and Windows
validation scheduling unchanged.
