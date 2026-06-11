# Native Provider Terminal Plan

Date: 2026-06-10
Status: implementation-ready plan; provider enablement remains gated

## Goal

Finish the official native CLI rollout for:

- Qwen Code
- Kimi Code
- Mistral Vibe
- xAI Grok Build

Codex, Claude Code, and Gemini CLI remain the reference implementations.
Vibyra must run each provider's genuine TUI as the foreground PTY process while
Vibyra owns model authorization, scoped credentials, billing, recovery, and
permission setup.

No provider may fall back to Codex or imitate another CLI. Vibyra Agent remains
only for model families without an applicable official coding CLI.

Documentation cannot guarantee correctness. Release requires captured native
traffic, process ownership, credential-containment tests, billing evidence, and
live PTY acceptance on every claimed platform.

## Verified Provider Matrix

| Provider | Pinned target | Executable | Protocol | Primary blocker |
| --- | --- | --- | --- | --- |
| Mistral | `mistral-vibe==2.14.1` | `vibe` | OpenAI Responses | Tool shell inherits environment; Standard approvals are not a sandbox |
| Moonshot | `@moonshot-ai/kimi-code@0.14.0` or verified native archive | `kimi` | OpenAI Responses | Responses credential may be readable from generated config/tools |
| xAI | `@xai-official/grok@0.2.39` | `grok` | OpenAI Chat Completions | New proprietary runtime, ancillary requests, credential broker |
| Qwen | `@qwen-code/qwen-code@0.17.1` | `qwen` | OpenAI Chat Completions | Managed Node 22+, new adapter, sandbox and environment-token exposure |

Version pins must be rechecked immediately before implementation. Preview,
latest, third-party, or unverified binaries are forbidden.

## Non-Negotiable Contracts

1. The genuine provider executable owns the PTY.
2. The immutable launch descriptor binds terminal, provider, runtime, adapter,
   protocol, native model, billing model, permission mode, and install digest.
3. The native CLI receives only a short-lived terminal credential, never the
   Vibyra account bearer token.
4. Model inference reaches only the loopback Vibyra gateway.
5. Native model switching cannot escape the authorized billing model.
6. Standard mode has a real OS/process sandbox, not only approval prompts.
7. Full mode uses the provider's documented bypass behavior after explicit
   Vibyra confirmation.
8. Cancellation, retry, disconnect, crash, and duplicate requests settle
   billing exactly once.
9. Telemetry, updates, OAuth, cloud handoff, connectors, and auxiliary model
   requests are disabled or explicitly supported.
10. Stale workers fail closed and never launch Vibyra Agent or Codex.

## Six-Agent Ownership

| Track | Ownership | Deliverable |
| --- | --- | --- |
| 1 | Qwen runtime and Chat Completions | Managed Node, Qwen profile, protocol fixtures, sandbox and credential proof |
| 2 | Kimi runtime and Responses | Verified installer, isolated home, Responses capture, resume and credential proof |
| 3 | Mistral runtime and Responses | Patched/verified Vibe runtime, real sandbox, trust restrictions and credential proof |
| 4 | Grok runtime and Chat Completions | Official artifact installer, personal-account path, credential broker and ancillary request control |
| 5 | Shared architecture | Runtime profiles, protocol adapters, install integrity, launch digest, request ledger and kill switches |
| 6 | Verification and rollout | Failure harnesses, acceptance matrix, live evidence bundle and go/no-go decisions |

Implementation agents must own disjoint files where possible. Provider agents
must not independently modify shared gateway modules; the shared-architecture
owner integrates protocol and registry changes.

## Phase 0: Freeze And Capture

Before changing routing:

1. Keep all four Vibyra-credit native adapters disabled.
2. Capture the current 357-test desktop AI baseline and backend native-terminal
   baseline.
3. Download each exact official artifact into a disposable test environment.
4. Capture `--help`, `--version`, process tree, files created, environment
   reads, startup network traffic, native request bodies, stream events,
   signals, resume identifiers, and permission prompts.
5. Record unknown or unexplained network requests as release blockers.
6. Create redacted protocol fixtures from the captured traffic.

Never design compatibility endpoints from documentation alone.

## Phase 1: Shared Runtime Foundation

Add focused shared modules:

- `desktop/lib/aiTerminalNativeRuntimeProfiles.mjs`
- `desktop/lib/aiTerminalRuntimeHomes.mjs`
- `desktop/lib/aiTerminalRuntimeLaunch.mjs`
- `desktop/lib/aiTerminalRuntimeInstaller.mjs`
- `desktop/lib/aiTerminalRuntimeIntegrity.mjs`
- `desktop/lib/aiTerminalFeatureFlags.mjs`
- `desktop/lib/terminalGatewayRequests.mjs`
- `desktop/lib/nativeTerminalProtocols/index.mjs`
- `desktop/lib/nativeTerminalProtocols/openAiResponses.mjs`
- `desktop/lib/nativeTerminalProtocols/openAiChatCompletions.mjs`

Keep existing Codex, Claude, and Gemini branches unchanged until the new
interfaces pass equivalence tests.

### Runtime Profile

Each immutable profile owns:

```text
runtimeId
providerId
modelFamilyPredicate
installerManifest
profileVersion
protocolAdapterId
credentialBinding
homeBuilder
environmentBuilder
argumentBuilder
permissionArguments
ownershipValidator
interruptStrategy
assignmentTiming
```

### Protocol Adapter

Each adapter owns:

```text
route matching
credential schemes
native request normalization
Responses conversion where required
stream translation
tool-call and tool-result conversion
error envelope
token count
request identity
usage normalization
```

Responses remains Vibyra's internal backend contract. Do not introduce another
general message abstraction.

## Phase 2: Installation Integrity

Replace direct in-place installation with:

1. Download/install into a staging directory.
2. Verify official package name, exact version, platform, architecture, and
   published integrity/checksum.
3. Verify the executable resolves inside the managed runtime root.
4. Run bounded `--version` and smoke startup checks.
5. Persist mode-0600 `runtime-manifest.json` with artifact and executable
   digests.
6. Atomically activate the verified runtime.
7. Preserve the previous verified version for rollback.
8. Reject changed PATH binaries, partial installs, checksum failures, and
   unsupported host runtimes.

Provider specifics:

- Qwen requires Vibyra-managed Node 22+; current host Node 20 is insufficient.
- Kimi should prefer official native archives because npm runtime requirements
  and installation documentation currently disagree.
- Mistral uses isolated `uv` tooling and Python 3.12+.
- Grok must use only `@xai-official/*` artifacts and must not execute its npm
  trampoline or a personal `~/.grok/bin/grok`.

## Phase 3: Exactly-Once Gateway And Billing

Add a terminal request ledger:

```text
terminalId + stable native request identity -> Vibyra request reference
```

Requirements:

1. Extract native request IDs where available.
2. Otherwise derive a canonical request fingerprint plus terminal turn
   sequence.
3. Send `X-Vibyra-Terminal-Request-Id` to the backend.
4. Reserve once and record provider attempts under the same reservation.
5. Concurrent duplicates attach to the in-flight request.
6. Completed duplicates use bounded replay or a deterministic error, never a
   second charge.
7. Cancellation before dispatch releases the reservation.
8. Cancellation after dispatch settles recorded usage or the conservative
   dispatched estimate.
9. Missing usage triggers provider-generation reconciliation before estimate
   charging.

Extend the frozen launch descriptor and terminal grant with:

```text
launchSchemaVersion
runtimeProfileVersion
protocolAdapterVersion
gatewayContractVersion
installFingerprint
featureFlagSnapshot
launchDigest
```

Renewal may extend expiry only. It must never widen models, runtime, protocol,
permissions, or digest.

## Phase 4: OpenAI Responses Native Path

Implement and prove one reusable Responses path before enabling Mistral or
Kimi.

Required coverage:

- full history and system input;
- text and reasoning deltas;
- encrypted reasoning state when emitted;
- flat function tools;
- fragmented function names and arguments;
- parallel and repeated tool rounds;
- function-call outputs;
- completed, incomplete, failed, malformed, and disconnected streams;
- usage in completion, late usage, and missing usage;
- client cancellation and retry idempotency.

The existing `/desktop/v1/responses` route may be reused only after exact Vibe
and Kimi captures pass. Provider-specific routes may be used to enforce runtime
identity:

```text
/desktop/mistral/v1/responses
/desktop/kimi/v1/responses
```

## Phase 5: OpenAI Chat Completions Native Path

Add authenticated provider routes:

```text
/desktop/grok/v1/chat/completions
/desktop/qwen/v1/chat/completions
```

Preserve:

- messages and tool-result history;
- text and reasoning fields;
- indexed parallel tool calls;
- fragmented IDs, names, and JSON arguments;
- `finish_reason` values;
- standard OpenAI errors;
- streamed and late usage.

Translate to the backend Responses contract and translate Responses SSE back
to native Chat Completions chunks. Do not route Qwen or Grok through Codex.

## Phase 6: Credential Broker And Sandbox

This phase is a release blocker for managed credits.

### Credential Rules

- No terminal credential in public session state, transcripts, crash logs, or
  Vibyra account payloads.
- No personal provider credentials copied into managed homes.
- Strip `KIMI_*`, `MOONSHOT_*`, `MISTRAL_*`, `QWEN_*`, `XAI_*`, OpenAI,
  Anthropic, Google, cloud, and OpenRouter credentials before injection.
- Test `env`, `printenv`, `/proc`, config reads, shell tools, child processes,
  crash handlers, plugins, hooks, MCP servers, and direct shell commands.

Preferred solutions:

- Grok: validate `auth_provider_command` with a parent-bound Vibyra credential
  broker.
- Mistral: use a deterministic, hash-verified patch or upstream mechanism that
  loads the token into private adapter memory and removes it from `os.environ`.
- Kimi: prove an official credential reference, eager-load/redact flow, or
  brokered credential path; config-file plaintext is not acceptable.
- Qwen: its shell inherits the process environment. If the token cannot be
  hidden from child commands, keep managed-credit Qwen disabled.

### Sandbox Rules

- Standard mode must mechanically block writes outside the authorized
  workspace.
- Approval prompts alone do not satisfy Standard mode.
- Verify platform sandbox support independently on Linux, macOS, and Windows.
- If a platform lacks the required sandbox, Standard launch fails closed.
- Full mode removes the sandbox only after explicit Vibyra consent.

## Phase 7: Provider Rollout

### 7.1 Mistral Vibe

1. Generate isolated `VIBE_HOME`.
2. Configure one `openai-responses` model and disable telemetry, updates,
   notifications, connectors, experiments, voice, MCP, external skills, local
   models, and teleport.
3. Keep project Vibe configuration untrusted.
4. Standard: `--agent default` inside Vibyra's process sandbox.
5. Full: `--agent auto-approve` after confirmation.
6. Prove the credential is unreadable to Bash and direct `!` commands.
7. Enable Linux first; gate other platforms separately.

### 7.2 Kimi Code

1. Install a verified `0.14.0` native artifact.
2. Set isolated `KIMI_CODE_HOME`.
3. Suppress legacy `~/.kimi` migration.
4. Configure one `openai_responses` provider and exact model.
5. Disable telemetry, update, notification, cron, MCP, plugin, and account
   traffic.
6. Standard uses native manual approval plus Vibyra's real sandbox.
7. Full uses `--yolo`.
8. Explicit process recovery uses the stored native session ID; never replay
   the old prompt.

### 7.3 Grok Build

1. Add the new `grok` runtime and xAI model-family mapping.
2. Release personal-account mode first using native authentication.
3. Use isolated `GROK_HOME`, terminal-specific leader socket, disabled updates,
   telemetry, tracing, feedback, and sharing.
4. Standard: `--permission-mode default --sandbox workspace`.
5. Full: `--permission-mode bypassPermissions --sandbox off`.
6. Control or reject ancillary `grok-build` summary/title calls.
7. Enable managed credits only after the credential broker and exact-model
   Chat Completions billing pass.
8. Do not bundle the proprietary binary without xAI redistribution permission.

### 7.4 Qwen Code

1. Install verified Node 22 and `@qwen-code/qwen-code@0.17.1`.
2. Set isolated `QWEN_HOME`, `QWEN_RUNTIME_DIR`, and system settings.
3. Configure one OpenAI-compatible provider and exact Qwen model.
4. Disable auto-update, statistics, telemetry, cache sharing, suggestions,
   hooks, MCP, extensions, and secondary model calls.
5. Standard: `--approval-mode default --sandbox -e none`.
6. Full: `--approval-mode yolo -e none`.
7. Validate Docker/Podman or Seatbelt availability before Standard launch.
8. Enable last because it combines managed Node, a new protocol adapter, and
   unresolved environment credential exposure.

## Phase 8: Recovery And Session Semantics

- Renderer/bridge recovery reconnects to the existing detached process.
- Provider-native resume is used only when intentionally relaunching a lost
  process with the same immutable launch descriptor.
- Never automatically replay a prompt after process loss.
- Persist provider session IDs separately from Vibyra terminal IDs.
- Add one profile compatibility version per runtime.
- Reject stale profile, adapter, runtime, install fingerprint, model, or launch
  digest without affecting unrelated terminals.
- Close removes the isolated managed home and revokes both local and backend
  grants.

## Phase 9: UI And Feature Flags

Readiness requires:

```text
installed
integrityVerified
localFeatureEnabled
backendFeatureEnabled
adapterReady
modelFamilySupported
sandboxReady
credentialContainmentPassed
```

Add:

- global native-provider kill switch;
- one switch per runtime;
- platform-specific enablement;
- personal-account and managed-credit readiness separately;
- picker states for downloading, validating, ready, adapter-disabled,
  sandbox-missing, update available, rollback, and killed.

Do not leak internal adapter details into normal model rows.

## Phase 10: Failure Injection And Acceptance

Create one fake CLI harness per provider that records:

- arguments and environment variable names;
- PTY rows/columns and control sequences;
- signals and interruption;
- native requests and resume IDs;
- created files and child processes.

Create a gateway fault harness that can:

- fragment streams byte-by-byte;
- split/reorder tool deltas;
- omit usage;
- duplicate completion;
- disconnect mid-tool;
- delay indefinitely;
- return 400, 401, 403, 429, and 500.

Inject:

- missing runtimes and sandbox dependencies;
- corrupt/wrong-architecture artifacts;
- checksum and signature failure;
- interrupted install and disk exhaustion;
- CLI, worker, bridge, and Electron crashes;
- revoked grants, stale versions, changed models, and kill switches.

## Provider Go/No-Go Matrix

Every provider must pass:

- genuine executable owns foreground PTY;
- native `/help`, commands, file tools, shell tools, approvals, interruption,
  and resume;
- exact selected model across picker, descriptor, wire request, reservation,
  and transcript;
- fresh and resumed tool rounds;
- Standard and Full permission behavior;
- rapid typing, Unicode, multiline paste, resize, grid, fullscreen, links, and
  bottom geometry;
- cancellation, disconnect, close, crash, logout, recovery, and rollback;
- credential canaries absent from tools and children;
- exact-once billing for every success and failure path;
- no unexplained auxiliary network traffic;
- install, update, failed update, and rollback;
- stale workers fail closed;
- frontend, desktop, backend, and live PTY tests.

Automatic no-go conditions:

- any Codex or Vibyra Agent fallback;
- readable spending credential;
- missing real sandbox in Standard mode;
- provider or model mismatch;
- unexplained paid auxiliary request;
- duplicate reservation or settlement;
- missing usage without reconciliation;
- stale worker recovery;
- unverified full-access bypass;
- unverified installer provenance.

## Rollout Order

1. Shared profiles, integrity, feature flags, request ledger, and test harnesses.
2. Responses protocol compatibility.
3. Mistral Vibe on Linux.
4. Kimi Code on the first verified platform.
5. Chat Completions protocol compatibility.
6. Grok Build personal-account mode.
7. Grok Build managed-credit mode if credential brokering passes.
8. Qwen Code last.
9. Expand each provider to additional platforms independently.
10. Migrate existing Claude, Gemini, then Codex conditionals into shared
    profiles only after behavioral equivalence is proven.

## Final Validation

Required before each provider flag changes:

```bash
npm run test:desktop-ai
php artisan test --filter VibyraNativeTerminalApiTest
```

Also require:

- package/runtime integrity checks;
- provider-specific fake CLI and fault-injection suites;
- live authoritative PTY transcript;
- redacted process tree and network capture;
- redacted outbound model/protocol capture;
- backend reservation and final settlement evidence;
- fresh and resumed session evidence;
- Standard and Full permission evidence.

The adapter becomes ready only after these artifacts are reviewed and the
provider-specific kill switch is explicitly enabled.
