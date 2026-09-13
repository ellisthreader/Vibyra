# Teammate reliability implementation — 7 September 2026

The seven reproduced creation/configuration defects are repaired on isolated
branch `fix/teammate-reliability`, based on release worktree commit
`1a8b3486bd4104d1deded74f2006de7ef6c16c22`. The audited UI matches published
0.6.1 source `6485f8c920acaf81964fbb3e81f9a7e6421cb72c`.

This is a locally verified implementation candidate. It has not replaced the
installed app or been published. The original task and release worktrees,
active desktop processes, account databases and user project folders were
preserved. The installed AppImage remained SHA-256
`ca84818df2e9df1c9e144ee45d82965b9eea1045373c44cc421def55c9e6d290`.

## Findings and implemented behavior

| Problem | Implemented fix | Evidence |
|---|---|---|
| New teammate form cannot accept input | Shared editor portals outside the inert workspace; modal focus/inert ownership survives rerenders and nested dialogs. | Trusted browser clicks/typing, caret and keyboard checks; native WebKit typing/Escape. |
| Routine and skill forms have the same freeze | All create/edit forms use the repaired shared dialog. | Five create/edit variants checked in Chromium and WebKit. |
| Shown engine and internal selection disagree after loading | One effective selection follows usable capabilities until the user chooses; loading, unavailable and failed-probe states explain recovery. | Delayed/failed probes, recheck and deliberate-choice cases. |
| Successful teammate creation is reported as failed after refresh error | Stores apply the returned saved record immediately; native transaction receipts prevent duplicate writes after lost replies or reloads. | Browser fault injection; native concurrent, restart, migration, rollback and conflict tests. |
| Routine/skill repeated submissions create duplicates | Immediate form/store locks, visible saving state, native request receipts for create/update/revision, safe pending Close. | Delayed/repeated submit checks; one routine/skill version per token. |
| Failed skill assignment remains checked | Checkbox changes only after confirmed persistence; pending state, local error and loading retry. | Failed assignment, retry and reload cases. |
| Failed memory addition discards the draft | Retain submitted text on failure; clear only that draft on success and preserve newer typing. | Failed write/newer draft checks; native memory replay, correction and deletion tests. |

Final review also fixed routine editing so a paused routine remains paused and
changing its teammate is persisted. A timeout retains the request receipt after
late success until the original form reconciles it; retry cannot create a second
item merely because the response arrived after the visible timeout.

## Native persistence contract

Schema 5 adds receipts keyed by account and request UUID. Each receipt commits
with its write and fingerprints operation, target scope and payload. Changed
content or target cannot reuse a committed token. Native account selection and
existing account-specific databases remain authoritative; renderer tokens grant
no access. Receipts contain entity IDs and hashes, not copies of memory/brief
text. Replays read current records; deleted records remain deleted.

A profile transaction failure can leave one empty reserved home, reused by its
stable retry ID. Deleting it after releasing the database lock could destroy a
concurrent successful retry's home, so cleanup does not do that. Migration uses
the existing database backup mechanism. An older binary refuses schema 5; a
future release rollback must preserve new data and use a deliberate compatible
backup/recovery procedure rather than force an older schema version.

## Verification

| Check | Result and boundary |
|---|---|
| Existing frontend suite | 777 passed. |
| Actual-component browser regression suite | 22 passed; result in `browser-results.json`; Chromium input is real, IPC is fault-injected. Included in Linux CI. |
| Native Linux WebKit interaction | All five teammate/routine/skill create/edit variants accepted native typing, closed on Escape and restored workspace interaction; `webkit-results.json`. Ephemeral WebKit2 context on private Xvfb display, mocked IPC. |
| Full Rust workspace tests | 342 core tests, 248 desktop tests, 2 updater signing tests and scratch persistence journey passed. Two existing ignored tests remain ignored. Ordinary provider opt-ins are no-op unless explicitly enabled. |
| Real Claude and Codex context | Explicit opt-in passed: both providers returned persisted brief, memory and skill markers in two fresh sessions each; scratch databases reopened between sessions. |
| Real Claude and Codex resume | Explicit opt-in passed: each provider completed two turns in the same bound conversation and retained the expected prior answer. |
| TypeScript and frontend build | Passed; existing bundle-size advisory remains. |
| Dead-code and source-size gates | Passed; zero first-party desktop sources over 200 lines; generated provider logos excluded by the canonical gate. |
| Rust formatting and strict Clippy | Passed: workspace formatting and all-target strict Clippy (`-D warnings`). |

The first attempt at the full native debug build exhausted the shared target
volume. Only this task's failed compilation outputs were moved/removed; old
cached binaries and other builders were preserved. The successful full suite
used an isolated `/tmp/teammate-native-target`, pinned Rust 1.97.1, debug info
disabled and one Cargo job. This infrastructure failure was not a passing test.

## Reproduction

From `desktop-tauri` after `npm ci`, run `npm test`, `npm run build`,
`npm run check:dead-code`, and `npm run test:teammate-ui`. The browser runner
uses installed Chrome; `VIBYRA_CHROME` overrides its executable. Fixture output
and screenshots are written to a fresh temporary directory.

Run `cargo test --manifest-path src-tauri/Cargo.toml --workspace --locked`,
`npm run rust:fmt`, and `npm run rust:clippy` with the pinned toolchain.
On a constrained machine, set `CARGO_TARGET_DIR` to a scratch volume,
`CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`, and
`CARGO_INCREMENTAL=0`; keep native builds serialized.

For real provider calls, explicitly set `VIBYRA_LIVE_TEAMMATE_TESTS=1` for
`cargo test --manifest-path src-tauri/crates/vibyra-core/Cargo.toml --test teammate_journey -- --nocapture --test-threads=1`.
Set `VIBYRA_LIVE_ENGINE_TESTS=1` for the adjacent `--test live_engines` target.
These require authenticated CLIs and perform actual model requests. Neither is
a signed-in packaged Tauri UI test.

## Remaining delivery gates

- A packaged Linux candidate must complete signed-in create/chat/configure,
  application restart with chat history, and one harmless scheduled run/history.
- Packaged Windows interaction and restart checks have not run on this Linux
  machine. The new browser CI step has been added but remote CI has not run.
- Build/package provenance, hashes, signed publication and replacement of the
  installed app are subsequent delivery work. No release-readiness or universal
  zero-bug claim follows from the local test results.

See `docs/plans/teammate-reliability.md` for the reviewed acceptance plan.
