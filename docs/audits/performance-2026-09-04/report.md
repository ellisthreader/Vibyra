# Vibyra performance audit — 4 September 2026

The subsequent implementation and final validation are documented in [implementation.md](implementation.md). The audit-only statements and measurements below describe the original audit stage.

The highest-value work is to repair the broken Expo assets, reduce the amount of chat history processed and transferred on each save, verify production HTTP concurrency, and exclude generated directories before registering native file watches. Existing terminal output pacing performs well in the tested stress scenario and should be preserved.

This is an audit and implementation plan. **No production source optimization, deployment, installation, account change, or paid provider call was performed.** Audit documents and diagnostic evidence were added. Existing and concurrent changes were preserved.

“100% accuracy” or “nothing can ever break” would be an unsupported guarantee. This report distinguishes directly measured behavior, source-confirmed risks, proposed targets, and work requiring production or device evidence. It is not a claim that every function, device, or production journey was exercised.

## Scope and measurement conditions

The supplied `/home/ellis/Desktop/SaaS` checkout is retired. Its retirement note directs work to **`/home/ellis/Desktop/Vibyra`**, which was audited. Baseline HEAD was `b36fc0ab017dd816979cd4c3fbb869210377d30d`, branch `release/0.2.8`, desktop version `0.2.8`, with pre-existing changes. The marketing website was redesigned concurrently during the audit; its original and later measurements are kept separate below.

| Surface | Evidence collected | Remaining coverage limits |
| --- | --- | --- |
| Tauri desktop, React/xterm, Rust core | Frontend/native suites; format, lint, type and size checks; production frontend build; real seven-PTY native stress probe in both phase orders; owned process CPU/RSS; actual watcher fixture | Debug native executable with minified production frontend; diagnostic screen bypassed account/workspace UI. No packaged cold-start distribution, signed-in end-to-end journey, long soak, Windows/macOS run, or physical input-to-photon measurement |
| Expo native phone and browser client | Full available mobile checks; persistence microbenchmark using actual source; streaming/render/persistence review; attempted production web export; PNG integrity checks | Export blocked by pre-existing image corruption. No actual iPhone/Android release runtime, Hermes frame profile, battery test, or mobile network journey |
| Laravel API and workers | Full available PHP suite; synthetic authenticated HTTP-kernel benchmarks; query counts and bytes at increasing history size; production launcher review; isolated local HTTP contention experiment; three single public production GETs | In-memory SQLite and warm kernel differ from production. No production DB query plans, private account data, APM, worker topology inspection, load test, real AI-provider timings, or billing transaction |
| Public marketing website | Vite builds; real headless Chromium desktop, narrow/mobile viewport and reduced-motion runs; transfer and animation measurements; source tests and screenshots | Concurrent redesign changed the baseline. Local server has no production CDN/compression; viewport emulation is not a phone. Not a Lighthouse/Core Web Vitals score or full conversion-flow audit |
| Supporting tools | Build scripts, Metro scope, release/update constraints and repository inventory | Remotion rendering, npm installer distribution, third-party CLI internals and remote machines were not performance benchmarked |

The inventory covered 1,758 selected source/config/test files across the repository; this is a routing and change-detection inventory, not a percentage of code reviewed. Generated/dependency trees were excluded from broad exploration. Hot-path review and the available suites provided the functional evidence.

Host: Ubuntu Linux, Intel i7-6700K, four cores/eight threads, approximately 16 GiB RAM, NVIDIA GTX 1080, WebKitGTK 2.52.6, Node 22.23.2, PHP 8.3.6. The desktop's own toolchain selects Rust 1.97.1; the older root pin is not the desktop compiler. Source resides on the HDD-backed root filesystem; Cargo uses the shared NVMe target directory.

Other applications and builds were active. Significant I/O and some memory pressure were observed; see [host-pressure.json](evidence/host-pressure.json). Consequently, compilation elapsed times, cold launch times and occasional browser long tasks are **not** presented as intrinsic Vibyra performance. CPU percentages use one full logical core as 100%; summed RSS double-counts shared pages and is not private memory or proof of a leak.

Fixtures used scratch files, synthetic credentials, isolated native XDG directories and an unavailable real keyring, in-memory SQLite, and non-delivering cache/session/mail settings. The native probe used local shell output; provider fetching was blocked. No microphone recording was performed.

## Validation results

| Check | Result |
| --- | --- |
| Desktop frontend tests | 434 passed |
| Desktop typecheck, dead-code check, first-party 200-line gate | Passed; generated provider-logo exclusion reported separately |
| Desktop production frontend build | Passed |
| Rust workspace tests | 312 passed: 123 core, 187 desktop, 2 updater-signing; one desktop clipboard test ignored |
| Rust formatting and clippy, all targets with warnings denied | Passed on this Linux host |
| Mobile line gate, typecheck and tests | Passed; 141 tests |
| Laravel PHPUnit | 383 tests, 2,422 assertions; no failures, one skipped, three PHPUnit notices |
| Website source tests | Two passed; these cover the original hero source and do not establish coverage of the concurrent redesign |
| Original marketing production build | Passed |
| Concurrent marketing build | Initially failed because `home-responsive.css` was not yet present; a later rebuild passed after that concurrent file appeared |
| Expo production web export | **Failed:** `src/assets/vibyra-cobalt.png: unsupported file type: undefined` |
| PNG verification | 114 files inspected; 14 failed identification/integrity verification |
| Native stress probe | Two complete runs, 160 input markers total, zero dropped markers |
| Watcher fixture | Ignored events filtered and source changes delivered; unnecessary native watches reproduced |

The skipped Laravel test is `PublishBridgeIntegrationTest::test_desktop_bridge_payload_publishes_with_precise_statuses_and_errors`, which requests the legacy `desktop/lib/publishIntegration.test.mjs` runner. That integration was not exercised here. A focused repeat of `CreditCalculatorTest` passed all six cases; the initial full-suite notices remain recorded rather than silently described as a clean suite. The ignored Rust clipboard test requires separate display/clipboard validation.

Results and exact commands are in [evidence/validation-summary.json](evidence/validation-summary.json); underlying logs accompany it. Passing unit and source-invariant tests does not prove release-device performance or all user interactions.

## Prioritized findings and decisions

### 1. Repair invalid imported assets before attempting an Expo performance baseline

**Priority: P0 for Expo release readiness. Confidence: reproduced.**

The Expo export fails on `src/assets/vibyra-cobalt.png`. Its bytes match HEAD, confirming this blocking file predates the audit. Fourteen PNGs have the invalid leading signature `89504e470a1a0a00`, and Pillow cannot identify them. The full list is in [asset-signatures.json](evidence/asset-signatures.json), corroborated by [asset-decode.json](evidence/asset-decode.json).

Affected assets include the shared cobalt logo, three plan icons, ten marketing screenshots/poster assets. The original website also displayed a broken `desktop-multi-terminal.png` when that lazy image was reached. A valid filename or successful TypeScript build does not establish valid media.

**Action:** recover known-good originals, verify complete decoding and dimensions, retain binary Git attributes, then rerun Expo export and the affected rendered screens. Do not repair only the signature: the body may also be damaged. Confirm whether the concurrent website still references each old screenshot before replacing unused artwork.

Decodable logo candidates exist at `backend/public/vibyra-cobalt.png` (1029 × 750) and `desktop-tauri/src/assets/vibyra-cobalt.png` (160 × 117). Separate `src/assets/billing-plans/` images also decode, but are large card artwork and are not established substitutes for the small plan icons. [Recovery candidates](evidence/asset-recovery-candidates.json) record these distinctions; visual equivalence must be checked before replacement.

**Acceptance:** imported images decode; Expo production export passes; logo/plan images render on web and native release builds. This is a prerequisite for measurement, not a claimed speed improvement.

### 2. Reduce local persistence work during streaming

**Priority: P1. Confidence: source-confirmed path and measured CPU scaling.**

`src/context/useAppStatePersistence.ts` builds the full persistable state whenever its chat dependencies change. `src/utils/persistenceSecrets.ts` serializes saves through a FIFO; every save extracts secrets, performs verified secure-storage writing, sanitizes the complete tree and serializes the public state. The queue preserves ordering, but intermediate streaming snapshots can still accumulate work.

Actual `createPersistableAppState` plus `JSON.stringify`, five warmups and 20 samples, approximately 2 KB of text per message:

| Fixture | Serialized state | p50 CPU | p95 CPU |
| --- | ---: | ---: | ---: |
| 1 thread / 80 messages | 164,703 bytes | 0.50 ms | 0.61 ms |
| 10 threads / 800 messages | 1,643,916 bytes | 3.50 ms | 4.99 ms |
| 40 threads / 3,200 messages | 6,574,656 bytes | 14.47 ms | 19.81 ms |

These Node results exclude secure storage, sanitization, public-storage I/O, React rendering and Hermes/device behavior. They demonstrate the scale of repeated work, not a measured mobile frame drop. See [mobile-bench.json](evidence/mobile-bench.json).

**Action:** coalesce replaceable public-state snapshots before normalization/storage; persist dirty threads or sections; batch displayed streaming deltas; write secrets only when their state changes while retaining verified storage. Flush authoritative final state on stream completion and lifecycle transitions. Explicitly preserve account-switch/logout ordering, failed-storage recovery, and secure/public separation.

**Acceptance:** a fake slow-storage test proves bounded pending snapshots, final-state durability and no secret resurrection after logout; storage operation counts fall during a fixed streaming fixture; actual iPhone/Android release profiling confirms reduced JS work. A debounce that drops the final message is unacceptable.

### 3. Replace full-history cloud saves with a compatible incremental contract

**Priority: P1. Confidence: measured through the actual Laravel kernel.**

`src/context/useCloudSync.ts` already has a 700 ms debounce, duplicate suppression, latest-payload checks and a 30-second failure cooldown. The remaining issue is payload size: it sends the full state. `backend/app/Http/Controllers/Concerns/AuthEndpoints.php` persists it, and `UserPayloads.php` returns a user payload containing full app state. The current sync caller does not use that full state response.

Synthetic authenticated requests used 80 messages per thread, 12 samples per case, warm application state and SQLite in memory. Percentiles use nearest-rank order statistics; with 12 samples the reported p95 is the largest observation, not a stable population estimate.

| Threads | POST body* | Changed save p50 / p95 | Unchanged save p50 | Session GET p50 | SQL queries: changed save / GET |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 171,216 B | 11.63 / 13.20 ms | 8.13 ms | 2.55 ms | 3 / 2 |
| 10 | 1,711,629 B | 116.07 / 124.34 ms | 69.39 ms | 10.25 ms | 3 / 2 |
| 40 | 6,846,369 B | 534.73 / 629.31 ms | 301.48 ms | 51.02 ms | 3 / 2 |

*The body column is the base history fixture; the changed-save case adds a small revision/title field. Its 40-thread response is 6,851,633 bytes. Roughly **13.7 MB of uncompressed JSON** can therefore cross the request/response boundary for one small edit. HTTP compression and real network throughput were not measured for this authenticated endpoint. The whole harness peaked at about 131 MiB of PHP allocated memory; that is not a per-request memory baseline. See [backend-bench.json](evidence/backend-bench.json).

Constant query counts show that this fixture's main scaling problem is not an N+1 query pattern. Repeated JSON processing, model state and response hydration still grow with history volume.

**Action:** introduce a versioned delta/per-thread sync API with revision/conflict checks and a compact acknowledgement; separate account/session metadata from lazy history hydration where clients permit it. Keep old clients working while migrating. Add aggregate byte budgets and deliberate history pagination/retention without silently losing user history. Keep server authority for plans, credits, permissions and account state.

**Calculated target, not achieved:** a 100,000-byte incremental request would be 98.5% smaller than the 6,846,369-byte base request. A 10,000-byte acknowledgement would be 99.85% smaller than the measured response. Initial full hydration still costs bandwidth; moving it must not hide that cost.

**Acceptance:** conflict/offline/retry/account-switch fixtures pass; duplicate sends remain idempotent; final state matches existing behavior; the benchmark records lower bytes and CPU; production canary telemetry confirms the improvement before rollout.

### 4. Verify and replace the production development-server launcher

**Priority: P1 pending deployment verification. Confidence: source and isolated transport reproduction; live topology unverified.**

`backend/scripts/start-production.sh` uses `artisan serve` for the web process. No repository setting of `PHP_CLI_SERVER_WORKERS` was found. Deployment environment overrides or replica counts were not inspected, so this does **not** prove the live service has only one worker.

PHP documents its built-in server's default single-process request handling and advises against production use. Laravel provides production Nginx/PHP-FPM and FrankenPHP deployment paths. [PHP built-in server documentation](https://www.php.net/manual/en/features.commandline.webserver.php), [Laravel deployment documentation](https://laravel.com/framework/docs/13.x/deployment).

In the audit-owned local server, a synthetic two-second handler delayed a separate `/up` request to 1.91–1.94 seconds; the subsequent unblocked warm request took 55 ms. This demonstrates the transport mechanism, not a production incident or an authentic AI request. See [http-concurrency.json](evidence/http-concurrency.json).

**Action:** inspect effective worker/replica settings and production request traces, then validate a production server configuration with bounded workers and stream timeouts. Isolate queue/scheduler workloads, preserve existing config/route/view caching and graceful shutdown, and size workers against measured private memory. Long AI streams must not starve health, authentication and ordinary API calls.

**Acceptance:** a staging mixed workload with slow streams, session saves and health requests has bounded unrelated latency and memory, correct stream delivery and graceful cancellation. Do not switch to a persistent-worker architecture without auditing request-state isolation.

### 5. Exclude generated trees before native watcher registration

**Priority: P1 for large workspaces. Confidence: measured with the actual Rust watcher.**

`desktop-tauri/src-tauri/crates/vibyra-core/src/fsx/watch.rs` filters ignored directories in its debounced callback, after `.watch(root, RecursiveMode::Recursive)` has registered the tree.

| Ignored `node_modules` subdirectories | Native watches added | Start time | Ignored events delivered | Source edit delivered |
| ---: | ---: | ---: | ---: | --- |
| 0 | 2 | 1.62 ms | 0 | Yes |
| 100 | 103 | 5.76 ms | 0 | Yes |
| 1,000 | 1,003 | 24.56 ms | 0 | Yes |
| 3,000 | 3,003 | 67.42 ms | 0 | Yes |

These are one-start-per-size Linux/debug fixture observations, not startup percentile estimates. Filtering already avoids frontend event storms, but not the kernel watch count or initial traversal. See [watcher-bench.json](evidence/watcher-bench.json).

**Action:** prune ignored directories before registration with correct handling of newly created/renamed directories, root changes and platform watcher semantics. Retain debouncing and bounded IPC batches. Do not replace native notifications with unconditional high-frequency polling.

**Acceptance:** adding 3,000 ignored directories leaves watch count close to the source-only fixture; ordinary edits and directory renames remain observable; repeated project switching drops old watches. Lower watch count is the demonstrated opportunity; a frame-rate gain remains to be measured.

### 6. Preserve the existing terminal pacing and input design

**Decision: keep; treat as a regression constraint. Confidence: two native stress runs.**

The built-in diagnostic opened seven real PTYs: one focused echo terminal and six noisy repainting terminals. Each phase sent 40 markers. The second run reversed phase order to reduce warmup bias.

| Run and phase | Echo p50 / p95 | Next-frame callback p95 | Dropped |
| --- | ---: | ---: | ---: |
| Run 1: all panes fastest tier | 24 / 48 ms | 50 ms | 0 / 40 |
| Run 1: background panes paced | 0 / 3 ms | 15 ms | 0 / 40 |
| Run 2: background panes paced first | 1 / 3 ms | 18 ms | 0 / 40 |
| Run 2: all panes fastest tier second | 23 / 39 ms | 41 ms | 0 / 40 |

In the reverse-order run, sampled renderer CPU median was 44.4% of one core while paced versus 106.3% in the fastest-tier control. Native process medians were 13.0% versus 26.4%. There were only five/eight comparable one-second phase intervals; use them as supporting evidence, not a battery or idle CPU benchmark. Summed process-tree RSS was approximately 582–585 MiB in this stress fixture, with shared-page double counting.

The source labels one metric `paint`; it stops at a `requestAnimationFrame` callback, before physical screen presentation. It is explicitly reported here as a **next-frame callback proxy**. Programmatic markers do not exercise physical keyboard input or prove a signed-in full workspace journey. See [native-probe.log](evidence/native-probe.log), [native-probe-counterbalanced.log](evidence/native-probe-counterbalanced.log) and [native-resources-summary.json](evidence/native-resources-summary.json).

Keep the synchronous `write_terminal` command that immediately enqueues to the native per-PTY writer thread. Do not restore an await-per-keystroke frontend queue or block the IPC thread with `write_all`. Preserve font/renderer readiness, NVIDIA-aware graphics policy, hidden-pane hibernation/resync, bounded output buffers, and session-save ordering. No automatic GPU-mode change is justified by this audit.

### 7. Bound exceptional native resource growth

**Priority: P2, or P1 when investigating recording/paste incidents. Confidence: source-confirmed conditions; not reproduced with user audio or an unbounded stress test.**

| Path | Finding | Safe improvement and acceptance |
| --- | --- | --- |
| `commands/voice.rs`, `voice_level.rs` | `arecord` has no native capture deadline. The 120-second limit truncates after the whole file is read; the meter deadline only stops metering. A missing stop can grow the raw file and the later read. | Enforce native recorder lifetime/cleanup and a bounded read, preserving discard and cost limits. At 16,000 mono 16-bit samples/s, raw data is 32,000 B/s: 3.84 MB at two minutes and 115.2 MB/hour if capture continues. Test with a fake recorder and temporary file; do not need a real microphone/provider call. |
| `vibyra-core/src/pty/writer.rs` | The per-session `mpsc::channel<Vec<u8>>` is unbounded. A child that stops reading can accumulate queued paste/input bytes. | Add a nonblocking byte budget with explicit backpressure/error handling, no silent input loss and preserved byte order. Keep fast typing independent of a blocked reader; test paste, close and reader recovery. |
| Terminal retained output | Existing per-session limits include a 4 MiB ring and 1 MiB pending-output cap. An illustrative 24-session workload has 120 MiB of raw payload capacity alone. | This is not allocated idle memory or a global application cap: `PtyManager::create_session` does not enforce a total count. Measure actual retained/private memory and aggregate session policy before changing history; preserve resync and scrollback correctness. |

The detached frontend event-bus fixture processed 10,000 one-KiB events in about 9.27 ms and retained 1,953 output events under its cap. Existing bounds should be maintained; this short test is not leak certification.

### 8. Profile mobile chat rows and desktop startup before broader refactoring

**Priority: P2. Confidence: source-level opportunities; user-visible gains unmeasured.**

`src/screens/workspace/inline/ChatMessageList.tsx` uses a `ScrollView` and maps all messages. Per-thread persistence caps history at 80 messages, so this is bounded, but long text/code can still be expensive. Stream updates replace message state in `useAgentChatMessages.ts`; the simulated fallback in `chatStream.ts` repeatedly slices/joins growing word prefixes.

After reducing persistence work, measure a release-device streaming conversation with realistic long code blocks. Start with stable row props/memoization and chunk batching; adopt virtualized rendering only with correct variable heights, scroll-follow, selection and persistent approval-card state. React Native documents that `ScrollView` creates all its children and contrasts it with lazy list rendering. [React Native ScrollView documentation](https://reactnative.dev/docs/scrollview).

The desktop primary emitted JavaScript chunk is approximately 938 KB uncompressed / 262 KB gzip; its static imported closure is approximately 960 KB raw. Auth and workspace splitting may defer terminal-related parsing before login, but requires cold-auth and fast-restore measurement. Existing dialogs and video already have lazy boundaries. The optional auth-video chunk is approximately 3.69 MB raw / 2.78 MB gzip and intentionally embeds media for Linux WebKit compatibility. Do not mechanically convert that path to ordinary external video URLs or discard its poster/reduced-motion/teardown behavior.

### 9. Marketing website: original result and concurrent replacement

**Original baseline, now superseded by concurrent source work:** the hero fetched the entire 29,122,922-byte MP4 as a blob while also starting direct media loading. Completed responses totaled about 31.0–31.3 MB on desktop, narrow viewport and reduced-motion scenarios. The separate media request was aborted; its full size is not counted twice. Normal scenarios kept approximately 60 animation-frame callbacks/s while stationary and below the hero. Reduced motion stopped that loop but still fetched the whole video.

At an ideal 10 Mbit/s, the video payload alone requires `29,122,922 × 8 / 10,000,000 = 23.30 seconds`, excluding overhead. A 3 MB replacement would reduce that video's bytes by 89.7%; this was a proposed target, not an optimization performed in this audit. [Original browser evidence](evidence/browser-bench.json).

The concurrent homepage replaces that component with a different demonstration. **Do not apply the old 31 MB claim or its remediation blindly to the new page.** The first attempted rebuild caught an unfinished stylesheet import; a subsequent build passed. Current-browser measurements are recorded separately in [browser-current-bench.json](evidence/browser-current-bench.json).

**Replacement snapshot:** the later successful bundle transferred **927,986 bytes** in each of the three local scenarios, with no video requests, no captured request failures/JavaScript exceptions, and no recurring JavaScript animation-frame callbacks during the sampled stationary/below-hero intervals. The desktop and narrow rendered screenshots were inspected. This is about **97% fewer completed response bytes** than the original desktop baseline, resulting from the concurrent redesign, not an audit-authored optimization. It is a different page, not a controlled same-design A/B experiment. CSS animations and total CPU are not measured by counting JavaScript animation-frame callbacks.

The new bundle was built at approximately 21:26 UTC / 22:26 local; source work continued afterward. Its screenshots and measurements are a dated, provisional snapshot, not certification of the eventual final redesign. Future website work should start from that newer page rather than optimize the obsolete video hero.

For any future scroll-video design, preserve the approved interaction while measuring viewport-gated loading, an appropriate poster, reduced-motion loading policy, cancellation and event-driven seeking. Web performance guidance supports controlling video preload and deferring offscreen media. [Video performance guidance](https://web.dev/learn/performance/video-performance).

### 10. Lower-priority opportunities and confirmed safeguards

- **Metro:** `metro.config.js` excludes `desktop` but omits `desktop-tauri`. Correct the current desktop crawl boundary in a separate small change and verify export. No timing claim is made because the actual crawl cost was not isolated.
- **Git review:** `vibyra-core/src/review/status.rs` combines status/numstat using repeated lookups and applies its display cap after upstream collection. A large changed-tree fixture should precede indexing/capping improvements; preserve rename/binary semantics.
- **Preview:** reviewed static-server paths already bound connections, request headers, timeouts and stream file contents with Range handling. Process cleanup and loopback/root boundaries are valuable constraints. Idle polling is a lower-priority measurement candidate, not an established bottleneck.
- **Memory search:** existing note/byte/result budgets and parallel search reduce broad unbounded work. Avoid indiscriminate cache invalidation changes without a measured slow fixture.
- **Community API:** query count stayed at six for 1, 10 and 50 fixture projects; p50 was 3.75, 7.04 and 21.22 ms. The public live GET confirmed `max-age=30, public, s-maxage=60, stale-while-revalidate=120`. Keep private/authenticated response boundaries intact.
- **Public availability sample:** single GETs to production `/up`, `/web-api/releases` and `/api/community/projects` returned 200 in approximately 0.50, 0.80 and 0.27 seconds respectively. Three observations establish reachability only, not p95, throughput or an uptime guarantee. [Public HTTP evidence](evidence/public-http.json).
- **Structure:** desktop/mobile source gates are clean. Splitting files for appearance or rewriting the stack is not justified as a performance intervention.

## Implementation sequence and regression controls

| Stage | Deliverable | Required proof before proceeding |
| --- | --- | --- |
| 0 — Establish a valid baseline | Restore corrupt imported images; finish/recheck the concurrent website; establish a stable source snapshot and representative devices | Successful production exports, decoded assets, rendered affected states; capture baseline without unrelated local builds |
| 1 — Remove repeated work | Coalesce local persistence and avoid unchanged secret rewrites; batch streaming state updates | Bounded pending work; final save survives logout/background/error cases; storage-operation and JS-time reduction; existing mobile suite |
| 2 — Reduce transfer and server contention | Versioned incremental sync/ack contract; staging production-server configuration | Old/new client compatibility, offline/conflict/idempotency tests; measured byte and request-time reductions; mixed-stream staging load test and rollback rehearsal |
| 3 — Bound workspace/native resources | Pruned watcher registration; native recording deadline/read limit; bounded PTY input budget | New/renamed directory delivery; no watcher/process leakage across switches; fake-recorder tests; ordered input under blocked-reader stress; terminal probe unchanged or better |
| 4 — Tune remaining presentation/startup costs | Device-led chat row work and measured desktop lazy loading; evaluate latest website only | Physical small/large phones, supported desktop graphics paths, real login/restore and Preview flows; no lost scroll position, content or approval state |
| 5 — Validate release behavior | Repeat relevant tests and benchmarks on release binaries, then staged deployment | Production telemetry confirms gains; session persistence, billing, permissions, updater and stream cancellation stay correct; revert switches remain available |

Changes should be small and independently reversible. Keep additive API compatibility until older clients age out; isolate any data migration from performance UI changes. For every stage, compare the same workload before/after, record bytes/CPU/query count and p50/p95 with sufficient samples, and reject a claimed gain that loses data, changes permissions or harms foreground input.

Suggested acceptance budgets are **targets to agree and validate**, not current guarantees: ordinary incremental sync requests at or below 100 KB; acknowledgements at or below 10 KB; bounded persistence backlog under slow storage; ignored-directory watch count close to the source-only fixture; no lost probe markers and no worsening of the measured paced-terminal latency distribution. A fixed synthetic workload can show a regression; production percentiles require production observations.

The unmeasured remainder needs explicit follow-through: release-device app start/restore and chat profiling, representative low/mid/high desktop hardware, cross-platform PTY/clipboard/preview coverage, longer memory/resource soak, and staging/production traces for SQL, queue age, slow streams, tail latency and cancellation. Real provider time-to-first-token should be measured separately from local rendering and persistence so external model time is not attributed to Vibyra.

## Evidence, reproducibility and preservation

[evidence/README.md](evidence/README.md) describes the fixtures, scripts and raw results. Each validation record names the command and elapsed time. Native probe logs retain source-produced metrics; synthetic Rust, PHP and Node fixture scripts make the inputs reviewable. Local paths inside captured commands refer to the audit workspace and should be adapted when replaying.

Only audit documentation, curated evidence, and small local skill/Obsidian workflow updates were authored in the repository. No existing dirty source was reverted. The temporary diagnostic executable was not installed. Default Cargo output restoration and audit-owned process cleanup are recorded in [evidence/cleanup.json](evidence/cleanup.json). Concurrent website edits are not audit fixes or evidence of performance improvements made by this audit.
