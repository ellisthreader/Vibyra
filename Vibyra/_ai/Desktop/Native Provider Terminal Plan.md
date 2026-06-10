# Native Provider Terminal Plan

Date: 2026-06-09

## Goal

Vibyra-credit terminals run the selected provider's genuine native CLI as the
foreground PTY process. Vibyra changes authentication, model routing, and
billing; it does not replace or imitate the provider TUI.

Acceptance requires the native executable, slash commands, approvals, tools,
interrupt behavior, session resume, and error presentation. Account management
and unrestricted model discovery may be disabled because Vibyra owns the
credential and model allowlist.

## Support Matrix

| Provider | Native CLI | Wire contract | Initial status |
| --- | --- | --- | --- |
| OpenAI | Codex | OpenAI Responses | Existing path; harden first |
| Mistral | Mistral Vibe | OpenAI Responses | Enable after Responses smoke |
| Moonshot | Kimi Code | OpenAI Responses | Enable after managed Node 22 |
| Anthropic | Claude Code | Anthropic Messages | Enable after Messages adapter |
| Qwen | Qwen Code | OpenAI Chat Completions | Enable after managed Node 22 |
| Google | Gemini CLI | Gemini GenerateContent translation | Enable last |

No unsupported provider may fall back to Codex. Vibyra-credit Auto remains
disabled until setup has an initial task that can be routed before process
creation. The routed provider and runtime are then immutable for that session.

## Session Contract

Persist an immutable launch descriptor:

```text
billingMode
providerId
runtimeId
adapterId
nativeModel
billingModel
allowedModels
permissionMode
sandboxMode
launchContractVersion
```

The legacy `agent` field may remain temporarily for display compatibility, but
must not decide billing, runtime, protocol, or credential behavior.

Cross-provider model changes require a new terminal. Same-provider changes are
allowed only when the gateway grant already authorizes the exact alias.

## Authentication

Authentication is two-hop:

1. Native CLI to desktop gateway: short-lived terminal capability constrained
   by terminal, runtime, provider, protocol, model allowlist, expiry, request
   rate, and concurrency.
2. Desktop gateway to backend: Vibyra account session plus a backend terminal
   grant. The native CLI never receives the account bearer token.

Close, natural exit, rejected recovery, logout, contract rollback, and provider
kill switch abort in-flight requests before revoking both grants.

Provider tokens may be inherited by tool subprocesses. Each adapter must test
credential visibility from a native shell tool. Prefer token indirection where
the CLI supports it. Otherwise use the narrowest short-lived grant, aggressive
rate/concurrency limits, exact model constraints, and immediate revocation.

## Backend

Keep protocol payloads native. Share only model policy, reservation lifecycle,
request registry, cancellation, usage reconciliation, and transport policy.

Required adapters:

- OpenAI Responses: Codex, Kimi, and Mistral.
- Anthropic Messages and count_tokens: Claude.
- OpenAI Chat Completions: Qwen.
- Gemini GenerateContent, streamGenerateContent, and countTokens translation:
  Gemini only, behind a separate feature flag.

Every request is registered before provider dispatch and finalized exactly
once as one of: not_started, started, completed, cancelled, disconnected,
provider_error, or unknown. Missing streamed usage is reconciled through the
upstream generation ID before estimate charging.

Exact concrete models fail closed. Only explicit Auto routing may choose a
different model. Terminal requests pass plan access and explicit tool
capability checks before reservation or provider dispatch.

Keep `/api/codex/responses` as a compatibility alias until old desktop workers
have expired.

## Desktop

- Resolve the launch descriptor before worker creation.
- Require both a verified runtime and an enabled adapter.
- Use managed/bundled runtimes for Vibyra credits; personal-account mode may
  use the user's official installation.
- Isolate every provider home/config from user accounts and disable telemetry,
  updates, login checks, and unsupported auxiliary traffic where possible.
- Strip inherited provider credentials for every Vibyra-credit runtime.
- Version every managed-credit worker, not only legacy `agent: vibyra`.
- Authenticate PTY WebSockets with short-lived one-time capabilities.
- Report native approval mode and OS sandbox availability separately.
- Standard mode fails closed when its required sandbox is unavailable.

Runtime installation pins versions and integrity, installs through staging,
verifies platform/architecture/runtime requirements, and atomically activates.
Readiness includes executable, adapter version, gateway capability, sandbox
dependencies, and smoke status.

## Rollout

1. Disable unsupported Vibyra-credit rows and taskless Auto; add provider kill
   switches and desktop/backend capability negotiation.
2. Introduce immutable launch descriptors and remove all Codex fallbacks.
3. Harden OpenAI: exact model/tool validation, request registry, cancellation,
   usage reconciliation, lifecycle revocation, and socket authorization.
4. Add isolated provider homes, credential-containment tests, verified runtime
   installation, and versioned recovery.
5. Enable Mistral Vibe through Responses.
6. Enable Kimi through Responses after managed Node 22.
7. Add Anthropic Messages and enable Claude after sandbox/licensing checks.
8. Add Chat Completions and enable Qwen after managed Node 22.
9. Add Gemini translation last; reject unsupported fields explicitly.
10. Add task-first Auto only after every eligible provider path is stable.

## Release Gates

Each provider remains disabled until all pass:

- process tree proves the genuine native executable owns the PTY;
- no user provider credential or Vibyra account token reaches the CLI;
- tool subprocess credential visibility is understood and constrained;
- startup auxiliary requests are explicitly supported or blocked;
- native `/help`, approvals, file tool, shell tool, interruption, and resume;
- fragmented streaming and multi-round/parallel tool calls;
- explicit cancellation, disconnect, close, crash, logout, and recovery;
- exact-once billing for success, failure, cancellation, and missing usage;
- runtime upgrade, backend/desktop version skew, kill switch, and rollback;
- stale workers cannot reconnect or silently fall back to Codex.
