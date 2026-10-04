# Deployed Agent V2 integration additions

This document covers the local MCP and developer platform slice deployed on 4 October 2026 (`632374cf`). It does not claim deployment of the broader source-only roadmap, including Linear/Slack triggers, delegation or automatic approval rules. Core Agent V2 retains the preceding production API contract.

## 6g. Local (stdio) MCP servers — roadmap Part 6

Source: `app/Services/AgentRuns/LocalMcp/*`, `LocalMcpController`, `routes/agents_v2_local_mcp.php`, config `agents_v2_local_mcp.php`
(flag `AGENTS_V2_LOCAL_MCP_ENABLED`, default off), Rust `vibyra_core::local_mcp` (client + supervisor) and `agent_v2_local_mcp*.rs` (runner).
Tests: `AgentV2LocalMcpTest`, `AgentV2ToolNamesTest`, concurrency scenario `localmcp` (13); Rust `cargo test -p vibyra-core local_mcp`,
`cargo test --lib agent_v2_local_mcp`. A program on the person's Mac, run through the leased Mac like computer and browser tools.
**The model never sees it:** Claude Code still loads only `vibyra-broker`; a local tool is one more broker tool.

- **What the backend stores.** Only an opaque id the Mac chose (`localId`), the Mac's `hostId`, a display name and the tool catalogue
  (name, description, schema, hints). Never the command line, arguments, working folder or environment, and no secret. It is an
  `agent_mcp_servers` row with `kind: "local"` (`url` is `local:<localId>`, never returned) plus an `agent_connections` row, provider
  `lmcp_<8 hex>`, tools `lmcp_<8 hex>__<name>`. Same pinning as remote MCP: revision hash, `needs_review` on a changed list.
- **Tool names.** The Mac refuses a manifest tool outside `^[a-z0-9_]{1,40}$` (`tools.rs::valid_tool`), which fails the whole run at
  preflight. Remote MCP names were `mcp_<8hex>__<up to 48>` (62 characters) and so failed for long tool names; both kinds now use
  `Mcp\ToolNames::make`: at most 40 characters, a long name is cut and ends in 8 hex of the hash of the original (stable, so grants survive).
- **Client routes** (account session; Mac or phone):
  `GET /local-mcp[?hostId]` → `{enabled, servers:[Server]}` (flag off: `enabled:false`, no servers);
  `POST /local-mcp/servers {hostId hex64, localId [A-Za-z0-9-]{8,64}, name ≤80, tools:[{name,description,inputSchema,annotations}]}` →
  `201|200 {server}` (first catalogue is pinned; a different one later is held for review). 409 `provider_unavailable` (flag off),
  `limit_reached` (10 per account), `server_removed`; body over 512 KB → 413.
  `GET /local-mcp/servers/{connectionId}`, `POST …/approve {revision}`, `PUT …/reads {tools}`, `DELETE …` (revokes every grant). These
  three also work on `/mcp/servers/{id}` (the hub treats a local server as an MCP server; `refresh`/`signin` there answer 409 `local_server`).
  `Server` = `{connectionId, serverId, provider, name, hostId, localId, status active|tools_changed, health, toolRevision, lastSeenAt, tools[], pending}`.
- **Grants** are the existing `PUT /agents/{id}/grants/{connectionId}` with the server's tool names. Everything is a `write` (exact approval)
  until the server annotates `readOnlyHint` AND the person marks it with `reads`.
- **Offered only when** the flag is on, the server is registered and not removed, the teammate holds a grant, the run's runtime snapshot
  `hostId` equals the server's `hostId` and the runtime declared `capabilities.localMcp: true` (`LocalMcpGrants::usable`).
- **Runner routes** (like §6c): `GET runs/{run}/local-mcp?generation` → `{actions:[{id,tool,kind,state,fingerprint,claimedGeneration,arguments,expiresAt,
  server:{connectionId,localId,generation,remoteName,toolRevision}}]}`; `POST …/{action}/claim {generation, fingerprint, tools:[live catalogue]}`
  rechecks grant revision, connection generation, host, flag, expiry and fingerprint (stale → `refused grant_revoked`) and the live catalogue
  against the pinned revision (changed → `refused tools_changed`, server held for review, run continues); 409 `not_approved`, `stale_fingerprint`;
  422 `tools_required`. Instead of `tools` the Mac may send `unavailable:{reason,error ≤300}` (server off, removed, would not start): the call
  is closed `refused` with that reason, visibly, nothing was sent. A write claimed under an older generation becomes `unknown` and is never replayed.
  `POST …/{action}/receipt {generation, result}`: `{text, structured?, truncated?, isError?}` (text cut to 16,000 bytes, structured over
  16,000 dropped with `truncated`, body over 64 KB → 413; `isError` → failed `tool_error`) or `{error ≤500, reason, unknown?}` with `reason`
  in `tool_error|timeout|crashed|unavailable|disabled|too_large|rpc_error|unsupported|secret|invalid|server_changed|not_found`; a write the
  Mac sent without a confirmed answer carries `unknown:true` → `unknown`/`outcome_unknown`. 409 `not_claimed`, `stale_lease`; identical
  duplicate = no-op; different = 409 `receipt_conflict`. Offline Mac: unclaimed approved calls follow §6c (lapsed lease: write `unknown`, read retryable).
- **Mac client.** `server/discover` first (2026-07-28, stateless, `_meta` on every request); an error that is not `UnsupportedProtocolVersion`
  (-32022), or silence for 5 s, falls back to `initialize` (2025-11-25 offered; 2024-11-05…2025-11-25 accepted). One process per server, started
  on first use, stopped after ~10 min idle or on quit (whole process group), restarted after a crash with 1/2/5/15/60 s backoff and a stop after
  5 failures in a row; per-call limit 60 s (1 s–5 min), a hung server is stopped; one line ≤4 MB; environment = clean allowlist plus only
  the variables the person set (never `VIBYRA_*`, `CLAUDE_CODE_*`, loader variables, or the app's provider keys); secret values live in
  the Keychain and are replaced by `[hidden]` in every error, status and result.

## 14. Platform and developer API — roadmap Part 11

Source: `app/Services/Platform/*`, `app/Http/Controllers/Platform/*`, `app/Http/Middleware/AuthenticateApiKey.php`, `routes/platform.php`, `config/platform.php`.
Every piece has its own default-off flag (`PLATFORM_ACTIVITY_ENABLED`, `PLATFORM_API_KEYS_ENABLED`, `PLATFORM_API_TRIGGER_ENABLED`,
`PLATFORM_WEBHOOKS_ENABLED`, `PLATFORM_MCP_SERVER_ENABLED`, the last also needing keys). Off: `404 not_available` (or `trigger_not_found`).

**Account activity** (read only, newest first). `GET /api/account/activity?limit≤100&before=<id>` (app session) and `GET /web-api/account/activity`
(browser session) → `{"ok":true,"items":[{"id","event","title","detail":{…},"actor":"account|system","createdAt"}],"next":id|null}`. Table
`account_audit_events` is append-only (the model refuses update/delete, a SQLite/PostgreSQL trigger refuses UPDATE; rows go only with the account).
Detail is short scalars under plain keys, never a credential or content. Other code writes with `AccountActivity::record($userId, 'event.name', [...], 'account'|'system')`
(never throws, no-op while off). Recorded today: `sign_in`, `device.trusted|denied|revoked`, `api_key.created|revoked`, `webhook.created|deleted|paused|resumed`,
`mcp_server.added`, `grant.changed|revoked`, `spend_cap.changed`.

**Personal API keys.** Created in the portal (`/account/developer`, `POST /web-api/developer/keys {name, scopes[], ratePerMinute?}` → 201 `{key, secret}`; the secret
`vyk_` + 40 letters/digits is returned once, only its SHA-256 is stored). Scopes: `runs:read`, `runs:create`, `triggers:invoke`, `projects:read` — there is no scope for
approvals, billing or key management, and those routes answer only to a person's session (a key gets 401 there). `DELETE /web-api/developer/keys/{id}` revokes at once.
At most 10 live keys. Per-key budget `ratePerMinute` (default 60, max 600): over it → `429 rate_limited` + `Retry-After`. `lastUsedAt` is written at most once a minute.
Key routes, `Authorization: Bearer vyk_…`: `GET /api/platform/v1/runs?agentId&limit` and `GET …/runs/{id}` (`runs:read`; no approval fingerprints or tool arguments),
`POST …/runs {prompt, agentId?, idempotencyKey?}` (`runs:create`; `Idempotency-Key` header also works; no agentId = the most recently used teammate; same admission, plan and
cohort checks as the client API), `GET …/projects` (`projects:read`: the account's cloud-sync projects), `POST …/triggers/{id}/invoke` (`triggers:invoke`). Errors: `401 invalid_api_key`, `403 insufficient_scope`.

**Outbound webhooks.** `POST /web-api/developer/webhooks {url, events[]}` (HTTPS port 443, same SSRF policy as remote MCP, checked on save and before every send; ≤5 per account)
→ 201 `{webhook, secret}` (`whsec_vy_…`, encrypted at rest, shown once); `POST …/{id}/pause {paused}`, `DELETE …/{id}`, `GET …/{id}/deliveries` (last 50). Events
`run.started`, `run.completed`, `run.failed` (also outcome-unknown), `run.needs_approval` (once per wait). Body: `{"id","type","createdAt","data":{"runId","agentId","state"}}` — ids and
state only. Headers: `Vibyra-Timestamp` (unix s), `Vibyra-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`, `Vibyra-Event`, `Vibyra-Delivery`; reject a timestamp
older than 5 minutes. A 2xx is delivery; anything else retries after 30 s, 60 s, 2 m, 4 m, 8 m (six attempts), then the delivery is `failed`; five failed deliveries in a row pause the
endpoint (`pausedReason: "failing"`, logged as `webhook.paused`, resume resets). Delivery is at least once; `Vibyra-Delivery` is the dedupe key. `vibyra:platform-webhooks-sweep` re-offers due deliveries each minute.

**MCP server.** `POST /api/platform/mcp` (key, no scope needed; tools follow scopes): JSON-RPC 2.0, one JSON answer per POST (no SSE, no session, never `Mcp-Session-Id`).
Handles `initialize` (echoes a supported `protocolVersion`: 2026-07-28, 2025-11-25, 2025-06-18, 2025-03-26), notifications (202), `ping`, `tools/list`, `tools/call` and, for the stateless style,
`server/discover`; every request stands alone. Tools (fixed descriptions): `list_runs`, `get_run` (`runs:read`), `list_projects` (`projects:read`), `start_run` (`runs:create`). A tool outside
the key's scopes is neither listed nor callable (result `isError`). No approval tool exists. `GET`/`DELETE` → 405. The 2026-07-28 behaviour is implemented from the stated
stateless description and is unverified against a real client.

