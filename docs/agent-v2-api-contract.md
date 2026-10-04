# Agent V2 API contract (runs on the selected AI account)

Date: 2026-09-30 · Status: backend implemented in source (Phase 1 + Phase 2 backend / rebuild Stages 0–2; Phase 6 / Stage 3 backend in §6c; Phase 8 backend in §6d),
feature-flagged off, **not deployed**. Clients (Mac runner, Mac chat, iPhone chat) are built
against this document. Source: `backend/routes/agents_v2.php`,
`backend/app/Http/Controllers/AgentsV2/*`, `backend/app/Services/AgentRuns/*`.
Tests: `backend/tests/Feature/AgentV2*Test.php`.

## 1. Principles

- The model runs on the Mac, on the AI account the person selected in Vibyra. The backend
  never calls OpenRouter and never reads, reserves, debits or settles the Vibes wallet on this
  path. Every run records `fundingSource: "connected_account"`.
- Integration credentials never leave the server. The runner asks the backend **broker** to
  call a tool; reads run server-side and return their result; writes wait for exact approval.
- The tool list for a run (the **manifest**) comes only from stored grants. Nothing a tool
  returns (email text, etc.) can add tools, accounts or recipients.
- The run journal (events) is the source of truth. Transport loss never means a task stopped.

## 2. Availability, auth and errors

**Flags.** `AGENTS_V2_ENABLED` (default `false`) **and** the account must be in
`AGENTS_V2_USER_IDS` (comma-separated user IDs, or `*` for everyone; empty = nobody).
Legacy `/api/agents/v1/*` is unchanged and keeps working.

**Client auth.** `Authorization: Bearer <app session token>` (same token as `/api/agents/v1`).
Guests are refused (403).

**Runner auth (F-03).** `/runner/{runtimeId}/*` is authenticated by `X-Vibyra-Runner-Key: <64 chars>` **alone**
(returned once by `POST /runtimes`) plus the lease `generation` on every write. The runner holds **no account session**:
an `Authorization` header on a runner route is ignored (an older runner that still sends one keeps working), and a
session without the key is `403 invalid_runner_key`. The key is stored only as a SHA-256 hash, is bound to one runtime
binding (one Mac host), and is rotated on every re-registration. The host must be a non-revoked `remote_hosts` row owned
by the binding's account, and that account must be in the V2 cohort. **A runner credential is never a person**: any
request to a client route (decision, grants, connections, schedules, …) that carries `X-Vibyra-Runner-Key` is refused
`403 runner_credential_refused`, and the runner is never handed the fingerprint of a pending write. Config
`AGENTS_V2_RUNNER_KEY_ONLY` (default `true`; `false` restores the legacy session + key double check as a rollback).
See §6f for what the Mac runner must change.

**Middleware.** All routes: `RequireApprovedMarket` (may return 451 `market_unavailable`),
throttles: client routes 120/min, admission 30/min, runtime registration 12/min, runner routes
600/min. Request strings are **not trimmed** under `/api/agents/v2/*` (byte-exact prompts and
text deltas).

**Error envelope** (all V2-specific refusals):

```json
{ "ok": false, "code": "stale_lease", "error": "This runner no longer holds the task lease." }
```

Branch on `code`, never on `error` text. Laravel validation failures are `422
{"message", "errors": {field: [...]}}`. Missing/expired session is `401 {"ok": false, "error"}`.

| HTTP | code | Meaning |
| --- | --- | --- |
| 503 | `agents_v2_disabled` | Flag off |
| 403 | `not_in_cohort` | Account not in `AGENTS_V2_USER_IDS` |
| 402 | `plan_required` | Agents need Pro (same `PlanLimits` check as v1) |
| 404 | `agent_not_found`, `run_not_found`, `action_not_found`, `connection_not_found`, `runtime_not_found`, `unknown_provider` | Not owned / missing |
| 409 | `agent_archived` | Teammate archived |
| 409 | `idempotency_conflict` | Same `idempotencyKey`, different payload |
| 409 | `runtime_required` | No active runtime binding for this account; body adds `fix {action:"choose_ai_account", message}` (§6d) |
| 409 | `provider_unsupported` | Selected binding has `capabilities.controlledTools !== true` |
| 403 | `invalid_runner_key` | Wrong/missing runner key |
| 403 | `runner_credential_refused` | A client route was called with `X-Vibyra-Runner-Key` (runners cannot decide, grant or read connections) |
| 401 | `session_required` | A client route was called with no `Authorization: Bearer` token (route-level door, F-30) |
| 409 | `host_unavailable`, `host_revoked` | Computer owned by someone else / removed |
| 409 | `stale_lease` | Runner generation is not the current lease generation |
| 409 | `run_cancelled`, `run_finished` | Run fenced; stop working on it |
| 409 | `run_not_active` | Tool call while not in an active state (e.g. waiting for approval) |
| 409 | `call_conflict` | Same `callId` reused with different tool/connection/arguments |
| 409 | `actions_open` | Complete while an action is pending/approved/dispatching |
| 409 | `invalid_transition` | Illegal state change (server bug guard) |
| 409 | `stale_fingerprint`, `already_decided`, `approval_expired` | Approval decision refused |
| 422 | `invalid_operations`, `empty_prompt`, `empty_answer`, `generation_required`, `arguments_too_large`, `credential_refused`, `attachment_not_found`, `invalid_cursor`, `invalid_device` | Bad input |
| 422 | `secret_confirmation_required`, `rule_not_allowed`, `rule_not_granted`, `rule_scope_unsupported`, `rule_limit`, `invalid_query`, `invalid_format` | Part 16 refusals (§15) |
| 409 | `stale_cursor` | Read marker for a conversation that moved on (§6d) |
| 429 | `attachment_limit` | 100 attachment uploads per day |

## 3. Run lifecycle

States: `queued`, `waiting_for_computer`, `starting`, `running`, `waiting_for_tool`,
`waiting_for_approval`, `waiting_for_signin`, `paused_by_limits`, `completed`, `failed`,
`cancelled`, `outcome_unknown`. Terminal: `completed`, `failed`, `cancelled`, `outcome_unknown`.

```
queued ⇄ waiting_for_computer → starting → running
running → waiting_for_tool → running            (server-side read)
running → waiting_for_approval → running        (write decided: allow/decline/expired/refused)
running → waiting_for_signin | paused_by_limits → running (runner resumes by posting output/tool call)
running | waiting_for_tool | waiting_for_signin | paused_by_limits → starting  (re-claim after lease expiry; see §6.7 for parked waits)
any live state → failed | cancelled | outcome_unknown
running → completed                              (only via runner /complete with an answer)
```

- Admission sets `queued` when the binding was seen in the last 120 s, else `waiting_for_computer`.
- `completed` requires a non-empty final answer and no open actions. Provider stop ≠ completed.
- `/complete` on a run holding an `unknown` write ends it `outcome_unknown` (reason `write_outcome_unknown`), not `completed`.
- `outcome_unknown`: runner failed while a write was `dispatching`/`unknown`.
- A `dispatching` action left by a dead server process is closed by `vibyra:agent-v2-sweep-dispatching` after `agents_v2.dispatch_stale_minutes` (default 5): a write is never re-sent; one read-only lookup confirms it (`completed`, `result.reconciled`) or it becomes `unknown` with an `outcome_unknown` receipt; a read fails `retryable`. A Mac-claimed action is swept only after the run's lease lapsed, a branch publish in phase `writing` after 20 minutes. Afterwards `/complete` is accepted and a cancel ends `cancelled` with the action `unknown`.
- An action left `approved` with no dispatch claim (`dispatched_at` null; a crash between the approval commit and the claim) is dispatched by the same sweeper after the same window through `Approvals::dispatch` (exactly once, every recheck again; a failed one ends `refused` with a `failed`/`refused` receipt); a Mac action (browser, or computer except `open_draft_pr`) is never server-dispatched and is closed only after the lease lapsed (write `unknown`, read `failed` retryable).
- One conversation (teammate) runs one turn at a time, in `conversationSeq` order.
- A run is pinned to the binding's `provider` + `accountRef` at admission. If the Mac selects a
  different account, that run is not claimable until the original account is selected again
  (or the person cancels). No silent substitution.

## 4. Events (journal)

Each run has a gap-free, monotonic `seq` starting at 1. Event object:

```json
{ "seq": 7, "type": "tool.result", "payload": { ... }, "source": "server|runner", "createdAt": "2026-09-30T12:00:00+00:00" }
```

Payloads are redacted (keys like `token`, `credential`, `authorization`, `password`, `secret`,
`cookie`, `api_key` → `"[redacted]"`) and bounded to 8 KB (`truncated: true` when cut).
Tool **results** (message bodies) are never journalled; only summaries and receipts.

| type | source | payload |
| --- | --- | --- |
| `run.admitted` | server | `{state, fundingSource:"connected_account", provider, model, grants}` |
| `run.claimed` | server | `{generation, hostId}` |
| `run.state` | server | `{from, to, reason}` — emitted on every transition |
| `message.delta` | runner | `{text}` |
| `message.final` | runner | `{text}` — emitted by `/complete` with the final answer |
| `status` | runner | `{text}` — optional progress line |
| `tool.requested` | server | `{actionId, callId, tool, kind:"read"|"write", connectionId, provider}` (`provider` on all four tool events, §6d) |
| `tool.result` | server | `{actionId, callId, tool, status:"confirmed"|"failed"|"unknown", outcome, summary, providerResourceId, url}` |
| `tool.refused` | server | `{actionId, callId, tool, reason, message}` (first 50 per run; later refusals are answered but not stored, §6f) |
| `journal.truncated` | server | `{dropped:"runner_events"|"refused_calls"}` — once per run, when streamed text/status or refused calls hit their cap (§6f) |
| `approval.requested` | server | `{actionId, tool, connectionId, account, arguments, fingerprint, expiresAt}` |
| `approval.decided` | server | `{actionId, decision:"allow"|"decline"|"none", state?}` |
| **`run.completed`** | server | `{answerChars, reason}` — notification hook |
| **`run.waiting_approval`** | server | `{actionId, tool, reason}` — notification hook |
| **`run.waiting_signin`** | server | `{scope:"connection", provider, connectionId, reason:"reconnect_required"}` or `{scope:"ai_account", code, reason}` — notification hook |
| **`run.failed`** | server | `{code, reason}` — notification hook |
| `run.cancelled` | server | `{reason:"cancelled_by_user"}` |
| `run.outcome_unknown` | server | `{code, reason}` |

The four bold hooks are what Phase 3 notifications consume. Nothing is delivered yet.

## 5. Client API (Mac chat + iPhone chat)

Base: `/api/agents/v2`. All bodies/answers are JSON.

### Run object

```json
{
  "id": "uuid", "agentId": "uuid", "conversationId": "uuid (teammate chat id)", "conversationSeq": 3,
  "idempotencyKey": "send-…", "state": "running", "stateReason": null, "terminal": false,
  "prompt": "exact text", "attachments": [{"name","mimeType","size","sha256?","ref?"}],
  "answer": null, "fundingSource": "connected_account",
  "runtime": {"bindingId","hostId","provider","accountRef","model","effort"},
  "profileRevision": 4, "eventCursor": 12, "cancelRequested": false, "resumeAfter": "iso|null" /* paused_by_limits only */,
  "actions": [{
    "id","callId","tool","kind":"read|write|none","provider","account","connectionId",
    "state":"pending_approval|approved|dispatching|completed|failed|unknown|refused|declined|expired|cancelled",
    "summary", "arguments": {…} /* writes only */, "fingerprint": "hex64|null" /* pending only */,
    "expiresAt": "iso|null" /* pending only */,
    "receipt": {"status":"confirmed|failed|unknown","outcome","providerResourceId","url","summary"} | null
  }],
  "createdAt","startedAt","finishedAt"
}
```

### `POST /runs` — admit

```json
{ "agentId": "uuid", "idempotencyKey": "[A-Za-z0-9._:-]{8,100}", "prompt": "≤20000 chars",
  "attachments": [ {"name": "a.pdf", "mimeType": "application/pdf", "size": 1234, "sha256": "…", "ref": "…"} ],
  "runtimeId": "uuid (optional; default = most recently registered binding)" }
```

`201 {"run": Run, "replayed": false}` on creation; `200 {"run": Run, "replayed": true}` when the
same key and identical `{agentId, prompt, attachments, runtimeId}` were already admitted
(retry-safe Send); `409 idempotency_conflict` if the key was used for a different payload.
Generate the key once per Send and persist it with the draft until a response is seen.
Attachments (≤8): uploaded file ids `{"id"}` (§6d) or, for older clients, metadata only. `POST /runs/preview` takes the same body (§6d).

### `GET /runs?agentId=uuid&limit=20` → `{"runs": [Run…]}` newest first (by `conversationSeq`).

### `GET /runs/{id}` → `{"run": Run}` with `ETag`. Send `If-None-Match` → `304` when unchanged.

### `GET /runs/{id}/events?after=<seq>&limit=<1..200, default 100>`

```json
{ "events": [Event…], "nextCursor": 12, "state": "running", "terminal": false, "latestSeq": 12 }
```

`ETag` varies with run state, latest seq, `after`, `limit`; `If-None-Match` → `304`. Poll with
`after = nextCursor`. Suggested backoff: 1 s while `running`/`starting`, 3 s while waiting,
10 s while `waiting_for_computer`; stop on `terminal: true` after draining events.

### `POST /runs/{id}/cancel` → `{"run": Run}` (idempotent; terminal runs returned unchanged).
Sets `cancelled`, fences all further runner writes (409 `run_cancelled`), cancels pending
approvals. An already-dispatched call keeps its late receipt. It cannot unsend an email.

### `GET /runs/{id}/tools` → `{"manifest": Manifest}` (same as runner manifest; for display).

### `POST /actions/{actionId}/decision`

```json
{ "fingerprint": "hex64 from approval.requested / run.actions[].fingerprint", "decision": "allow|decline" }
```

→ `{"action": ActionOutcome}` (see §6). `allow` rechecks, immediately before execution: grant
still active with the same revision and operation, connection active + same generation +
healthy, not expired, run not cancelled, fingerprint recomputes. If any check fails the action
becomes `refused` (200, no provider call). The write executes server-side exactly once;
repeating the same decision is a no-op returning current state. Wrong fingerprint → 409
`stale_fingerprint`; past `expiresAt` (15 min) → 409 `approval_expired` (action `expired`).

### Connections and grants

- `GET /connections` → `{"connections": [{"id","provider","account","health":"healthy|reconnect_required|revoked","generation","source":"install|connection","createdAt"} + hub fields (§6c)]}`.
  Existing `vibes_integration_installs` rows appear automatically with stable IDs
  (`source: "install"`). Reconnecting the same account bumps `generation`; connecting a
  different account through the legacy flow revokes the old ID (and its grants) and creates a
  new one. Extra accounts per provider are stored as `source: "connection"` via the add-account
  endpoints below; the ordinary-chat install is never replaced by them.
- `POST /connections/{provider}/start` `{"returnUrl"?}` → `{"flowId","url"}` (throttle 10/min). Open `url` in the
  system sign-in sheet. Providers: `gmail`, `github`, `google_calendar`, and Stage 3 `slack`, `notion`, `linear`, `google_drive`, `google_tasks`, `figma` (§6c). Google shows its account picker
  (`prompt=select_account consent`); Calendar asks for `agent_scope` (adds `calendar.calendarlist.readonly` +
  `calendar.freebusy`). The provider returns to the existing `/api/connectors/callback/{provider}`
  (single-use state). Errors: 404 `unknown_provider`, 409 `oauth_unavailable`, 503 `integrations_disabled`.
- `GET /connections/flows/{flowId}` → `{"status":"pending|connected|failed|expired","error","connection": Connection|null}`.
  Poll every 1–2 s while `pending`. Same account again → same connection, `generation` +1, healthy.
- `POST /connections` `{"provider","credential"}` → `201 {"connection"}` (pasted token, e.g. a second GitHub
  account; GitHub OAuth signs in as whoever is logged in on github.com). Refused token → 422 `credential_refused`.
- `DELETE /connections/{id}` → `{"ok": true}`. For `install` connections this is the legacy
  disconnect (ordinary chat loses it too). Revokes its grants.
- `GET /agents/{agentId}/grants` → `{"grants": [{"id","agentId","connectionId","operations":[…],"revision","revokedAt":null}]}`
- `PUT /agents/{agentId}/grants/{connectionId}` `{"operations": ["gmail_read","gmail_search"]}` →
  `{"grant": …}`. Operations must be in the provider's V2 catalogue (§6a); unchanged ops keep the revision, changes increment it.
- `DELETE /agents/{agentId}/grants/{connectionId}` → `{"ok": true}`.

### Runtime bindings (Mac only)

`POST /runtimes`

```json
{ "hostId": "hex64 (Mac host id)", "provider": "codex|claude|gemini|… [a-z0-9_-]{2,40}",
  "accountRef": "non-secret local account id ≤128", "model": "≤120", "effort": "minimal|low|medium|high|xhigh|max|null",
  "providerVersion": "≤60", "capabilities": { "controlledTools": true, "computerTools"?: bool } }
```

→ `201 {"runtime": {"id","hostId","provider","accountRef","model","effort","providerVersion","capabilities","revision","online","lastSeenAt","runnerKey"}}`.
One active binding per (account, host); re-registering (new selection) updates it in place,
increments `revision` and **rotates `runnerKey`** (the old key stops working). Never send AI
login material. `controlledTools: true` asserts the adapter can restrict the provider to the
broker tools only; admission refuses bindings without it.
`GET /runtimes` → `{"runtimes": [...]}` (no key). `DELETE /runtimes/{id}` → `{"ok": true}`.

## 6. Runner protocol (Mac)

Base: `/api/agents/v2/runner/{runtimeId}`; header: `X-Vibyra-Runner-Key` only (no account session, §2/§6f).
Every call after claim sends `generation` (body, or query for GETs).

1. **Claim** `POST /claim` → `204` (nothing to do) or
   ```json
   { "run": { "id","agentId","conversationId","generation": 1,"leaseExpiresAt","state":"starting",
     "prompt","attachments","runtime": {binding snapshot},"eventCursor",
     "profile": {"name","brief","memory","revision"},
     "history": [{"runId","prompt","answer"}]   /* ≤10 earlier completed turns, oldest first */,
     "tools": Manifest } }
   ```
   Poll every 2–5 s while idle. Lease = 90 s. Each claim increments `generation`.
2. **Heartbeat** `POST /runs/{run}/heartbeat {"generation"}` every ≤30 s →
   `{"state","cancelRequested","generation","leaseExpiresAt"}`. If `cancelRequested` or the state
   is terminal: interrupt the provider and stop. 409 `stale_lease` → another claim took over:
   stop immediately and discard local output.
3. **Stream output** `POST /runs/{run}/events {"generation","events":[{"type":"message.delta|status|message.final","text"}]}`
   (1–50 events, text ≤8000 each, may be empty string) → `{"eventCursor"}`. The first post
   moves `starting`/waiting states to `running`.
4. **Tool call** `POST /runs/{run}/tools`
   ```json
   { "generation": 1, "callId": "provider call id [A-Za-z0-9._:-]{1,100}", "tool": "gmail_search",
     "connectionId": "uuid from manifest", "schemaRevision": "from manifest", "arguments": { "query": "is:unread" } }
   ```
   → `{"action": ActionOutcome}`:
   ```json
   { "id","callId","tool","kind","connectionId","state","summary",
     "result": {…} /* completed|failed|unknown|refused|declined|expired|cancelled */,
     "receipt": {"status","outcome","providerResourceId","url"} | null,
     "expiresAt" /* pending_approval only; the runner is never given the approval fingerprint (F-03) */ }
   ```
   - Reads (kind `read`, §6a): execute now; `state: "completed"` with `result`, or
     `failed` with `result.error`. A provider 401 marks the connection `reconnect_required`,
     moves the run to `waiting_for_signin` and emits `run.waiting_signin`.
   - Writes (kind `write`, §6a): `state: "pending_approval"`; the run is `waiting_for_approval`; no
     further tool calls are accepted (409 `run_not_active`). Poll
     `GET /runs/{run}/actions/{actionId}?generation=N` (works even if cancelled) until the state
     leaves `pending_approval`/`approved`/`dispatching`, then give `result` to the model.
   - Policy refusal: `200` with `state: "refused"`, `result: {error, reason}`; reasons:
     `unknown_tool`, `not_granted`, `grant_revoked`, `connection_revoked`, `wrong_connection`,
     `reconnect_required`, `schema_changed`, `invalid_arguments`, `limit_reached` (40 calls/run),
     `outcome_unknown` (the same write already has an unknown outcome in this run; never repeated).
     Pass `result.error` to the model as the tool result.
   - Retrying the same `callId` with identical input returns the stored outcome without
     re-executing. Results are bounded to 32 KB (`truncated: true`).
5. **Manifest refresh** `GET /runs/{run}/tools?generation=N` → `{"manifest": Manifest}`.
6. **Complete** `POST /runs/{run}/complete {"generation","answer":"non-empty"}` → `{"run": Run}`. An answer over
   `max_answer_chars` (60 000) is **clipped with a notice, never refused** (F-05). A blank answer is `422 empty_answer`: that
   and any other non-retryable refusal must be followed by `fail` `runner_error`, never by re-running the model (§6f).
7. **Fail / wait** `POST /runs/{run}/fail {"generation","code","reason":"≤500","resumeAt"?: "RFC 3339"}`; `code`:
   `provider_signin` → `waiting_for_signin` (AI account sign-in; resume by posting output after
   the person signs in), `limits` → `paused_by_limits`, `provider_error|step_limit|runner_error`
   → `failed` (or `outcome_unknown` if a write is uncertain).
   A wait **parks** the run (lease released): claim skips it for the same binding `revision` until
   the Mac re-registers (selects the account again / another account) or, for `limits`, until
   `resumeAt` (provider reset time, clamped 1 min–7 days; default 30 min) passes. Then it is re-claimed
   (`→ starting`) and re-run from its prompt. Only declared `capabilities` keys are stored.

**Manifest**:

```json
{ "revision": "hex16", "tools": [ {
  "tool": "gmail_search", "connectionId": "uuid", "provider": "gmail", "account": "me@example.com",
  "kind": "read", "requiresApproval": false, "schemaRevision": "hex12",
  "description": "…", "parameters": { JSON Schema } } ] }
```

At most 10 entries: admission grant snapshot ∩ current grants ∩ active healthy connections, chosen by task relevance (§6d).
With several accounts, the same `tool` appears once per granted connection; the runner must
expose them to the model under distinct names (e.g. `gmail_search__<connection short id>`) and
map back to `tool` + `connectionId`. The provider session must have **no** built-in
shell/network/MCP tools that bypass this broker.

**Fingerprint** (server-computed, opaque to clients) = SHA-256 of canonical JSON of owner, run,
action, callId, tool, connectionId, connection generation, grant id + revision, canonical
arguments, schema revision and policy revision.

## 6a. Stage 2 tools and typed outcomes

| Provider | Reads | Writes (exact approval) |
| --- | --- | --- |
| `gmail` | `gmail_search` {query, pageToken?, maxResults 1–20} → messages, hasMore, nextPageToken, resultSizeEstimate, coverage · `gmail_read` {id, startChar?} → body ≤12 000 chars, bodyChars, truncated, nextStartChar | `gmail_send` {to, subject, body}; receipt = Gmail message id; MIME carries `Message-ID: <vibyra-{actionId}@agents.vibyra.app>` |
| `github` | `github_list_repositories` {page} · `github_list_issues` / `github_list_pull_requests` {repository, state open/closed/all, page} (30/page, hasMore/nextPage; issues exclude PRs) · `github_read_issue` {repository, number, page} · `github_read_file` {repository, path, ref, startLine} | `github_create_issue` {repository, title, body?} → receipt `owner/name#N` + issue URL · `github_comment_issue` {repository, number, body} → receipt comment id + URL |
| `google_calendar` | `google_calendar_list_calendars` {pageToken?} · `google_calendar_list_events` {calendarId, timeMin, timeMax, timeZone, pageToken?, maxResults ≤50} · `google_calendar_freebusy` {calendarIds[1–5], timeMin, timeMax, timeZone} (window ≤31 days, RFC3339 with offset, IANA zone) | `google_calendar_create_event` {calendarId, title, start, end, timeZone, description?}; never attendees, `sendUpdates=none`; event id `vb{actionId hex}` (Google dedupes) → receipt event id + htmlLink |

Every repository/calendar is explicit (no defaults); unknown arguments are `invalid_arguments`.
Non-refused results carry `result.outcome`:

| outcome | action state / receipt | meaning |
| --- | --- | --- |
| `confirmed` | completed / confirmed | provider confirmed (writes: id + matching fields). `result.reconciled: true` when found by the post-timeout lookup |
| `refused` | failed / failed | definite: `reason` `not_found`, `forbidden`, `insufficient_scope`, `conflict`, `invalid_request`, `credential_unavailable`; do not retry as-is |
| `retryable` | failed / failed | read timeout / 5xx; `retryable: true` |
| `rate_limited` | failed / failed | 429 or rate-limit 403; `retryAfter` seconds when known |
| `reconnect_required` | failed / failed | 401 or `invalid_grant`: connection → `reconnect_required`, run → `waiting_for_signin` |
| `outcome_unknown` | unknown / unknown | write timeout, 5xx or unconfirmable 2xx. One read-only reconciliation (Calendar by event id, Gmail by `rfc822msgid`; none for GitHub); never re-sent |

Receipts persist `outcome`, `provider_url` and `idempotency_key` (migration `2026_09_30_230000`).

## 6c. Mac computer tools — Phase 4

Source: `app/Services/AgentRuns/Computer/*`, `ComputerRunnerController`, Rust `agent_v2_computer*.rs`. Tests:
`AgentV2ComputerToolsTest`, `AgentV2ComputerPublishTest`. Provider `computer`: one connection per Mac folder grant
(`agent_workspaces`, chosen only in the Mac picker; `agent_connections.workspace_id`), mirrored into a V2 grant for that
teammate by `ComputerGrants::sync` (runs inside `LegacyInstalls::sync`). `PUT` on it → 409 `computer_grant_local`;
`DELETE` of its grant/connection revokes the Mac grant. Tools (each only while its flag is on, AND `AGENTS_LOCAL_RUNNER_ENABLED`):
reads `workspace_list|read|search|changes`; writes `workspace_edit`, `run_test` (`AGENTS_VM_TESTS_ENABLED`, can_test, macOS),
`publish_branch` (`AGENTS_GIT_PUBLISH_ENABLED`), `open_draft_pr` (+ `AGENTS_GITHUB_PR_ENABLED`). Offered only to runs whose
runtime snapshot is the folder's Mac (`hostId`) with `capabilities.computerTools: true`.

- Reads are created `approved` (run `waiting_for_tool`); writes wait for exact approval, then stay `approved` (no server
  execution) until the leased Mac claims them. `open_draft_pr` executes server-side at approval (existing exact PR writer).
- Runner: `GET runs/{run}/computer?generation` → `{actions:[{id,tool,kind,workspaceId,state,fingerprint,claimedGeneration,arguments,expiresAt}]}`;
  `POST runs/{run}/computer/{action}/claim {generation, fingerprint}` rechecks grant/connection/fingerprint/expiry/Mac/GitHub pin
  (stale → `refused`), 409 `not_approved`/`stale_fingerprint`; a write claimed under an older generation becomes `unknown`
  (never replayed), a read is re-claimed. `POST .../receipt {generation, result}`: 409 `not_claimed`, `stale_lease`; identical
  duplicate = no-op; different = 409 `receipt_conflict`. Late receipts after cancel are recorded.
- Receipts: edit `{written,path,sha256,snapshotSha256}` (hash must match approved content; `{error}` → `unknown`); test = V1 VM
  receipt + `outputSha256`; changes = snapshot metadata; publish `{upload}` (exact bytes; must equal the approved snapshot) →
  encrypted job `PublishAgentV2Branch` → receipt `headSha`, `commitUrl`.
- `publish_branch {repository, baseBranch, message, snapshotSha256, githubConnectionId?}` binds the matching `workspace_changes`
  result of this run, the teammate's granted GitHub connection (generation + grant revision) and `expectedHeadSha` = tip of the last
  confirmed publish for that folder (V2, else V1). With a head, `Publisher` adds one commit (parent = head, base tree + cumulative
  change) and fast-forwards the ref (PATCH, force false); a moved head is refused. `open_draft_pr {title, body?}` binds the last
  publish's repo/branch/head/base SHAs (a moved base branch is refused).

 (schedules) and event triggers — Phase 5

Source: `app/Services/AgentSchedules/*`, `app/Services/AgentTriggers/*`,
`Controllers/AgentsV2/{Schedules,Triggers}Controller.php`, command `vibyra:agent-v2-routines`
(every minute, `withoutOverlapping`, `onOneServer`, only while `AGENTS_V2_ENABLED`). Tests:
`AgentV2ScheduleMathTest`, `AgentV2SchedulesTest`, `AgentV2TriggerWebhooksTest`, `AgentV2TriggerPollsTest`.
There is no second execution path: every occurrence/event admits an ordinary run through the same
Admission (grant snapshot, pinned AI account, `fundingSource: "connected_account"`, no Vibes).
Writes inside those runs still wait for exact per-action approval (§5 decision flow).

**Capabilities.** `GET /capabilities` → `{"enabled","routines","triggers","triggerKinds":[…]}`. Never
503/403: all `false`/`[]` unless the flag **and** cohort admit the account. v1 `GET /api/agents/v1/teammates`
keeps `capabilities.routines: false`.

### Schedules

Schedule object:

```json
{ "id","agentId","conversationId","title","prompt","timezone":"Europe/London",
  "recurrence": {"type":"once","date":"2026-10-01","time":"09:00"} | {"type":"daily","time":"09:00"}
              | {"type":"weekly","weekdays":[1,5],"time":"18:15"},   /* ISO weekdays, 1 = Monday */
  "description":"Every Mon, Fri at 18:15","revision":1,"runtimeId":null,"catchUpMinutes":60,
  "overlap":"skip|queue","paused":false,"nextRunAt":"UTC iso|null","nextRunLocal":"local iso|null","createdAt","updatedAt" }
```

- `POST /schedules/preview {timezone, recurrence, count?≤10}` → `{"description","next":[{"at","local"}]}`. Show before saving.
- `GET /schedules?agentId=` → `{"schedules":[…]}` · `GET /schedules/{id}` → `{"schedule"}`.
- `POST /schedules {agentId, prompt, timezone, recurrence, title?, runtimeId?, catchUpMinutes? 0..1440 (default 60), overlap? (default skip)}`
  → 201. 402 `plan_required`, 422 `no_future_run` (past one-off), 409 `schedule_limit` (50/account).
- `PATCH /schedules/{id} {revision (current), …any editable field}` → bumps `revision`, recomputes `nextRunAt`
  from now. 409 `stale_revision` if `revision` is not current. Occurrences of an older revision are never admitted.
- `POST /schedules/{id}/pause {paused}` — pause clears `nextRunAt`; resume computes it from now (no back-fill).
- `DELETE /schedules/{id}` → soft delete; stops future occurrences; history stays readable.
- `GET /schedules/{id}/occurrences?limit≤100` → `{"occurrences":[{"id","scheduleId","revision","intendedAt","state","reason","runId","runState","createdAt"}]}` newest first.

Semantics: the server computes every time from the IANA zone + wall-clock intent. **DST:** a local time that
does not exist that day is skipped for that day (a one-off at such a time is refused, 422); an ambiguous
time runs once, at its first instant. Occurrence states: `pending` (claimed, being admitted), `waiting`
(run is `waiting_for_computer`), `admitted`, `skipped` (`previous_run_active`, `schedule_paused`,
`schedule_edited`, `schedule_deleted`), `expired` (`computer_offline`: its run stayed waiting past
`catchUpMinutes` and is moved to `failed` with reason `occurrence_expired` → `run.failed` hook;
`missed_window`: the scheduler itself was late), `failed` (admission refused; reason is its code, e.g.
`runtime_required`, `plan_required`, `agents_v2_unavailable`, `agent_archived`). Uniqueness is
(schedule, revision, intended time); run idempotency key `sched:<scheduleId>:<revision>:<unixIntended>`.
Overlap `skip` (default): an occurrence is skipped while an earlier one's run is live. After downtime only
the latest missed occurrence is considered (at most one catch-up, never a burst).

### Triggers

Trigger object: `{"id","agentId","kind","connectionId","filter","promptTemplate","ratePerHour","runtimeId","revision",
"paused","webhookUrl","lastError","polledAt","createdAt"}`.

| kind | source | filter (saved, never model-chosen) | dedupe key |
| --- | --- | --- | --- |
| `github.issue` / `github.pull_request` | repository webhook → `POST /api/agents/v2/hooks/github/{triggerId}` | `repository?` "owner/repo", `actions` (default `["opened"]`), `labels?` any-of | `X-GitHub-Delivery` |
| `linear.issue` | Linear webhook (Issues) → `POST /api/agents/v2/hooks/linear/{triggerId}` | `team?` key or id, `actions` (`created`/`updated`/`assigned`, default `["created"]`; an update that sets an assignee is also `assigned`), `labels?` any-of, `assignee?` (`"me"` = the trigger's connected Linear account, or a user id), `includeOwn?` | SHA-256 of the signed body |
| `slack.mention` | Slack Events API `app_mention` → ONE app endpoint `POST /api/agents/v2/hooks/slack` (no per-trigger URL or secret) | `channel?` one channel id | Slack `event_id` |
| `stripe.event` | Stripe webhook → `POST /api/agents/v2/hooks/stripe/{triggerId}` | `types` (required; `prefix.*` allowed) | Stripe event `id` |
| `api.invoke` | your own code → `POST /api/agents/v2/hooks/api/{triggerId}` with `Authorization: Bearer <trigger secret>` (shown once, like GitHub's), or `POST /api/platform/v1/triggers/{id}/invoke` with an API key that has `triggers:invoke` (§14). Flag `PLATFORM_API_TRIGGER_ENABLED`; `409 provider_unavailable` to create and absent from `triggerKinds` while off | none (`{}`) | `Idempotency-Key` header when sent (8–100 of `A-Za-z0-9._:-`), else every call is its own event |
| `gmail.message` | poll every `pollMinutes` (1–60, default 5) with `(query) after:<cursor>` | `query?`, `pollMinutes` | Gmail message id |
| `calendar.event_soon` | check every minute | `calendarId` (default `primary`), `leadMinutes` 5–240 (default 15) | event id + start |

- `POST /triggers {agentId, kind, promptTemplate, connectionId? (required for gmail/calendar/slack; optional for linear, needed for assignee `"me"`), filter?, ratePerHour? 1..60 (default 10), runtimeId?, signingSecret? (stripe whsec_… or the Linear webhook's signing secret; may be PATCHed in after creating the endpoint — the hook 404s until set)}`
  → 201 `{"trigger", "webhook": {"url","secret","contentType":"application/json"} | null}`. The GitHub `secret`
  is generated and **shown once**. Poll kinds need an active grant for that teammate on that connection with
  `gmail_search` / `google_calendar_list_events` (409 `not_granted`); the poll stops (`lastError: grant_revoked`) when it is revoked.
- `GET /triggers?agentId=`, `GET /triggers/{id}`, `PATCH /triggers/{id} {revision, filter?, promptTemplate?, ratePerHour?, runtimeId?, signingSecret?}`,
  `POST /triggers/{id}/pause {paused}`, `DELETE /triggers/{id}` (secret dropped; hooks then 404).
- `GET /triggers/{id}/events?limit≤100` → `{"events":[{"id","triggerId","eventKey","type","state":"admitted|skipped|failed|pending","reason","runId","summary","createdAt"}]}`.

Webhooks carry no session; the per-trigger secret is the authentication, checked over the raw body before
parsing: GitHub `X-Hub-Signature-256: sha256=HMAC_SHA256(secret, body)`; Stripe `Stripe-Signature` (v1, 300 s
tolerance); Linear `Linear-Signature` (bare-hex HMAC-SHA256 of the raw body, `hash_equals`, then the body's
`webhookTimestamp` (ms) must be within `AGENTS_V2_LINEAR_TOLERANCE_SECONDS`, default 60 → `401 stale_timestamp`; the
event key is the signed-body hash, so a replay with a fresh `Linear-Delivery` is a duplicate). Linear gives the secret
(Settings → API → Webhooks, admin), so it is pasted like Stripe's. Responses: `401 invalid_signature`, `404 trigger_not_found`, `202 {"ok":true,"state":"pong|ignored|admitted|skipped|failed","duplicate",
"eventId"}`. A redelivery returns the first outcome with `duplicate: true` and starts no run. Rate cap exceeded
→ event `skipped` / `rate_limited`; paused → `skipped` / `paused`. Run idempotency key `trg:<eventRowId>`.

**Slack (`POST /hooks/slack`).** One Slack app, one signing secret in the environment (`SLACK_SIGNING_SECRET`; unset →
`404 slack_not_configured` and `triggerKinds` omits `slack.mention`). `X-Slack-Signature: v0=HMAC_SHA256(secret,
"v0:{X-Slack-Request-Timestamp}:{raw body}")`, timestamp within 5 minutes (`401 stale_timestamp` / `invalid_signature`).
`url_verification` → `200` the challenge as text. An `app_mention` `event_callback` is **enqueued** (`ProcessSlackEvent`,
vibes queue) and answered `200 {"ok":true,"state":"queued"|"duplicate"|"ignored"}` at once (Slack retries after 3 s);
`event_id` is de-duplicated (cache guard at the door, then the per-trigger event row `slack:<event_id>`), so
`X-Slack-Retry-Num` retries never enqueue or run twice. The job routes by `team_id` (from the connection's account label
`Name · T…/U…`) to that account's active `slack.mention` triggers, then by `channel`. Creating one needs a Slack
connection granted `slack_read_channel` whose stored scopes include the bot scope `app_mentions:read` (else `409
reconnect_required`); `GET /connections` rows for Slack carry `mentions: {state: ready|reconnect_required, message,
reconnect}` and offer the usual Reconnect.

**Loop guard (all providers).** An event caused by the connected account's own identity (GitHub `sender.login` =
the account's `@login`; Linear `actor.id` starts with the account's id; Slack: a bot/`bot_message`, or the app's own bot
user from `authorizations`) is stored as `skipped` / `own_activity` and never runs, unless the trigger sets
`includeOwn` (GitHub and Linear: the person's own activity is the point). Per subject (GitHub `repo#number`, Linear issue,
Slack thread) a second event is `skipped` / `subject_busy` while an earlier run from the same trigger on it is not
terminal and was admitted within `AGENTS_V2_SUBJECT_WINDOW_MINUTES` (60, so a stranded run never blocks forever). Neither
skip uses the hourly cap: only admitted runs count.

**Notifications.** A run a trigger started titles its inbox/push items "… · from Linear|Slack|GitHub|…" and its destination
carries `from`.

**Untrusted event data.** The run prompt is the person's `promptTemplate`, then a bounded JSON summary of named
fields only between `<<<UNTRUSTED_EVENT_DATA kind="…"` and `UNTRUSTED_EVENT_DATA>>>` (markers inside the data are
removed), then a line telling the model it is data, not instructions. The run's tools still come only from grants.

Deferred: Gmail Pub/Sub `users.watch` push (polling is the whole path), Calendar push channels, GitHub App
install / automatic webhook creation, Slack events, per-occurrence notifications beyond the run hooks.

## 6c. Connections hub, catalogue and Stage 3 providers — Phase 6

Source: `app/Services/AgentRuns/Connections/{Hub,Readiness,Disconnect}.php`,
`Tools/Providers/{Slack,Notion,Linear,Drive,Tasks,Figma}Tools.php`, `AgentRuns/Mcp/*`,
`AgentRuns/Composio/*`, `Controllers/AgentsV2/{McpServers,Integrations}Controller.php`,
`routes/agents_v2_integrations.php`, migration `2026_10_01_030000`. Tests:
`AgentV2{ConnectionHub,Slack,NotionLinear,Workspace,McpServers,McpSecurity,Composio}Test` (Http::fake only).

### Hub: `GET /connections`

Each Connection (§5) also carries: `status` `ok|reconnect_required|insufficient_scope|needs_review|unconfigured`,
`name`, `accountLabel`, `email` (when the label is an email), `scopes` + `scopesSource` (`granted` from the token
response, else `requested` from the catalogue), `teammates` `[{agentId,name,operations,revision}]` (active grants),
`lastUsedAt` (last executed action), `reconnect` `{method:"POST",path}` when status is reconnect/scope, and `mcp`
`{serverId,url,status,protocolVersion,toolRevision,pendingRevision}` for MCP servers. `health` is unchanged.
`unconfigured` wins: the environment cannot serve the provider (catalogue not `ready`), so no reconnect is offered.
`insufficient_scope` is remembered per credential generation (a reconnect clears it). `DELETE /connections/{id}`
revokes every grant and drops the credential (MCP: forgets OAuth client/tokens; Composio: also deletes the remote
connected account, best effort). Reconnect = the existing start flow (`reconnect.path`); same account → same id, `generation`+1.

### Catalogue: `GET /catalogue` → `{"providers": [...]}`

`{provider, name, category, kind: builtin|mcp|composio, connect: [oauth|token|mcp_url|composio], tools:[{tool,kind}],
readiness: ready|unavailable, reason, message}`. `ready` = integrations on and this environment can connect it
(OAuth client id+secret present; GitHub also accepts a pasted token). Reasons: `integrations_disabled`,
`credentials_missing`, `flag_off` (MCP: `AGENTS_V2_MCP_ENABLED`), Composio `auth_config_missing` /
`isolation_unverified`. Ready is not live-verified (see the master plan's readiness table).

### Wave 1 tools (exact targets, typed outcomes as §6a)

| Provider | Reads | Writes (exact approval) |
| --- | --- | --- |
| `slack` | `slack_list_channels` {cursor?} · `slack_search_messages` {query, page} (needs a user token: the Agent add-account sign-in requests `user_scope` incl. `search:read`; a bot token → `insufficient_scope`) · `slack_read_channel` {channel ID, cursor?, limit ≤50} | `slack_post_message` {channel, text, threadTs?}; metadata `vibyra_action`=actionId; receipt `channel:ts`; reconciled by metadata; Slack `ok:false` = refused |
| `notion` | `notion_search` {query, cursor?} · `notion_read_page` {pageId, cursor?} (top-level blocks, 100/call) | `notion_append_text` {pageId, text} (paragraphs) · `notion_create_page` {parentPageId, title, text?}; no reconciliation |
| `linear` | `linear_list_teams` {cursor?} · `linear_search_issues` {query, teamId?, cursor?} · `linear_read_issue` {id UUID or ENG-12} | `linear_create_issue` {teamId, title, description?} · `linear_comment_issue` {issueId UUID, body}; entity id = actionId, reconciled by exact lookup. Comments need `comments:create` (`agent_scope`) |
| `google_drive` | `google_drive_search` {query, pageToken?} · `google_drive_read` {id, startChar?, tabOffset?} (12 000-char windows; Sheets 8 tabs/call) | — |
| `google_tasks` | `google_tasks_list_lists` {pageToken?} · `google_tasks_list` {listId, includeCompleted?, pageToken?} | `google_tasks_create` {listId, title, notes?, due YYYY-MM-DD}; no reconciliation |
| `figma` | `figma_read_file` {file} · `figma_read_node` {file, node?} · `figma_read_comments` {file} | — |

### Wave 2: Microsoft 365 (Graph, `Providers/{GraphApi,OutlookMail,OutlookCalendar(+Writes),OneDrive,Teams,SharePoint}Tools.php`)

Graph 401/`invalid_grant` → `reconnect_required`; 429 + Retry-After → `rate_limited`; write timeout/5xx → `outcome_unknown` + one
read-only lookup. `pageToken` = base64url of only `$skip`/`$skiptoken` from `@odata.nextLink` (never a URL). File reads use the
item's signed download URL (hosts `*.sharepoint.com`, `*.1drv.com`, `*.onedrive.com`; no redirects, no bearer; text ≤1 MB, first
16 000 chars; else `unsupported`). Teams/SharePoint on a personal Microsoft account → refused `personal_account_unsupported`.
Tests: `AgentV2{Outlook,Microsoft365}ToolsTest` (Http::fake only).

| Provider | Reads | Writes (exact approval) |
| --- | --- | --- |
| `outlook_mail` | `outlook_mail_search` {query, pageToken?, maxResults 1–25} · `outlook_mail_read` {id, startChar?} (12 000-char windows) | `outlook_mail_send` {to, subject, body}; 202 = accepted, not delivered; carries header `X-Vibyra-Action: vibyra-{actionId}` + the same named MAPI property; reconciled by a Sent Items filter on it |
| `outlook_calendar` | `outlook_calendar_list_calendars` {pageToken?} · `outlook_calendar_list_events` {calendarId "primary" or id, timeMin, timeMax, timeZone, pageToken?, maxResults ≤50} · `outlook_calendar_freebusy` {schedules[1–5 emails], timeMin, timeMax, timeZone} (getSchedule) | `outlook_calendar_create_event` {calendarId, title, start, end, timeZone, description?}; no attendees, sent in UTC; `transactionId` = `vibyra-{actionId}` (Graph dedupe); reconciled by that transactionId in the event window |
| `onedrive` | `onedrive_search` {query, pageToken?} · `onedrive_read` {id} | — |
| `teams` (work/school) | `teams_list_teams` · `teams_list_channels` {teamId} · `teams_read_channel` {teamId, channelId 19:…, pageToken?, limit ≤50} | `teams_post_message` {teamId, channelId, text, replyToId?}; receipt `channel:messageId`; reconciled only when exactly one message from this account with the exact text exists in the last 15 min. Needs the Teams `agent_scope` (ChannelMessage.Read.All needs admin consent) |
| `sharepoint` (work/school) | `sharepoint_search_sites` {query, pageToken?} · `sharepoint_search_files` {siteId, query, pageToken?} · `sharepoint_read` {siteId, itemId} | — |

### Remote MCP servers (`/mcp/servers`)

Off unless `AGENTS_V2_MCP_ENABLED`. Each server is a connection with provider `mcp_<8 hex>`; its tools are
`mcp_<8 hex>__<safe name>` (grant those names). `{id}` below is the connection id.

- `POST /mcp/servers` `{url, name?, returnUrl?}` → `201 {connection, server, signIn: null|{flowId,url}}`. HTTPS on 443
  only; the host is resolved and every address must be public (private, loopback, link-local, CGNAT, documentation,
  metadata and non-global IPv6 refused) and curl is pinned to the checked address. Errors: 422 `blocked_destination`,
  422 `mcp_unavailable` (unreachable, unsupported protocol, bad OAuth metadata, too large), 409 `limit_reached` (10),
  409 `provider_unavailable` (flag off).
- Transport: Streamable HTTP. `initialize` offers `2025-11-25`; the server's answer must be one of
  `2025-11-25|2025-06-18|2025-03-26`; `Mcp-Session-Id` and `MCP-Protocol-Version` ride on later requests; JSON or SSE
  answers; 12 s timeout, 1 MB cap, redirects refused for POST and re-checked (≤3) for metadata GETs.
- Sign-in (when the server answers 401): protected resource metadata (`resource_metadata` from `WWW-Authenticate`, else
  `/.well-known/oauth-protected-resource[/path]`), whose `resource` must be this server (or a path prefix); then
  authorization server metadata (RFC 8414 then OIDC paths), `issuer` must match and `S256` must be listed. Client =
  Client ID Metadata Document (`GET /mcp/client-metadata.json`) when supported, else Dynamic Client Registration (public
  client). Authorize with PKCE S256, single-use state and `resource`; token and refresh requests also send `resource`.
  Callback `GET /mcp/callback` (public). Outcome via `GET /connections/flows/{flowId}`. Reconnect: `POST /mcp/servers/{id}/signin`.
- `GET /mcp/servers/{id}` → `{server: {connectionId, provider, url, name, auth, status active|pending_auth|tools_changed,
  protocolVersion, toolRevision, tools:[{tool, remoteName, description, kind, readOnlyHint, destructiveHint, inputSchema}],
  pending: null|{revision, added, removed, changed, tools}}}`.
- Every tool is a **write (approval each time)** unless the server annotates `readOnlyHint: true` AND the person marks it
  with `PUT /mcp/servers/{id}/reads {"tools":[...]}` (other tools → 422 `not_read_only`; grant revisions bump).
- Tool list pinned by revision (hash of names, descriptions, schemas, read hints). Every call re-lists first; a different
  list → the action is refused `tools_changed`, the connection becomes `needs_review` (no tools in any manifest).
  `POST /mcp/servers/{id}/refresh` checks now. `POST /mcp/servers/{id}/approve {"revision"}` pins the pending list; grants
  keep only tools whose reviewed definition is unchanged (revision +1; emptied grants revoked). 409 `stale_revision`,
  `nothing_to_review`. Tool results: `{text ≤16 000, structured?, truncated?}`; `isError` → refused `tool_error`; a
  write with no confirmed answer → `outcome_unknown` (no reconciliation).

### Composio (`/composio`)

Only reviewed toolkits in `config/agents_v2_composio.php` (today `airtable`: `composio_airtable__list_bases`,
`__list_records`, `__create_record`). `POST /composio/{toolkit}/start {returnUrl?}` → `{flowId,url}` (Composio connect
link for our auth config and this account's opaque keyed `user_id`); callback `GET /composio/callback` (public) accepts
the account only if Composio reports it ACTIVE for this `user_id`, auth config and toolkit and it is the flow's own
account. Every call re-checks that ownership (`forbidden` otherwise; EXPIRED → `reconnect_required`). **Unavailable**
until `CHAT_CONNECTORS_COMPOSIO_API_KEY`, `CHAT_CONNECTORS_COMPOSIO_PRIVATE_ENABLED`, the toolkit auth config and
`CHAT_CONNECTORS_COMPOSIO_ISOLATION_VERIFIED` are all set; isolation has not been verified against our key.

## 6d. Superagent polish — Phase 8

Source: `Tools/{Relevance,ToolSelection,ToolProviders}.php`, `Planning/{TaskPlan,PlanGaps}.php`,
`AgentRuns/{Activity,Roster,RunAttachments,Templates}.php`, `Controllers/AgentsV2/{Plan,Overview,Attachments}Controller.php`,
`routes/agents_v2_overview.php`, `config/agents_v2_templates.php`, migration `2026_10_01_080000`. Tests:
`AgentV2{ToolSelection,TaskPlan,Overview,AttachmentsTemplates}Test`. Nothing here calls a model or spends Vibes.

**Task-relevant manifest (changed).** The ≤10 tools are no longer the first 10 by connection order. Only granted +
healthy tools are candidates (unchanged); selection only drops. Each granted connection gets a deterministic score:
service name in the prompt +100, the connection's account label (e.g. `work@acme.com`, `octocat`) in the prompt +150,
service words in the prompt (email, PR, calendar, …) +40, the trigger that admitted the run (`trg:` key: gmail/github/
calendar kinds) +80 (+40 its own connection), service name/words in the teammate brief/memory +30/+12, tool calls on
that connection in the last 20 earlier turns +3 each (≤30). Equal scores form a tier (connection order breaks ties);
tiers fill in score order, round-robin one tool per connection, **all reads of a tier before its writes**. Inside a
connection, tools whose own words appear in the prompt (e.g. "issue", "send") lead, then catalogue order. Manifest
order is therefore meaningful but clients must not depend on it. `revision` still changes with the set.

**Tool provider (added).** `run.actions[]` gain `provider` + `account` (from the call's own connection; tool-name
fallback). Events `tool.requested|tool.result|tool.refused|approval.requested` gain `payload.provider` (added on read,
so old journal rows have it too). Clients: stop guessing from tool-name prefixes. Run payloads carry no token counts;
`fundingSource: "connected_account"` is on every run, plan and roster row — use it to hide token/credit copy.

**`runtime_required` (changed).** Refusal is now
`409 {"ok":false,"code":"runtime_required","error":"Teammates run on an AI account you choose on your Mac, and none is selected yet.","fix":{"action":"choose_ai_account","message":"Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts."}}`.
`provider_unsupported` carries the same `fix.action` with an "Update Vibyra" message. Any refusal may carry `fix`.

### `POST /runs/preview` — task plan card (throttle 60/min)

Same body and validation as `POST /runs` (incl. attachment ids); nothing is admitted, stored or granted. 404
`agent_not_found`, 409 `agent_archived`, 422 validation. →

```json
{ "plan": { "agentId", "fundingSource": "connected_account", "ready": true, "maxTools": 10,
  "runtime": {…runtime object, "ok": true} | {"ok": false, "code": "runtime_required|provider_unsupported", "message", "fix"},
  "services": [{"provider","name","connectionId","account","score","reads":["gmail_search"],"writes":["gmail_send"]}],
  "tools":     [{"tool","provider","connectionId","account","kind","requiresApproval"}],
  "approvals": [ same shape, writes only — each asks for exact approval when called ],
  "dropped":   [ same shape — granted but cut by the cap ],
  "mentioned": ["github","gmail"],
  "missing": [{"provider","name","reason","blocking","message","connectionId","account","accounts"?,
               "fix": {"action","method","path","message"} | null}] } }
```

`missing.reason`: `not_connected` (fix `connect`, `POST /connections/{p}/start`), `unavailable` (environment cannot
connect it; fix null), `not_granted` (fix `grant`, `PUT /agents/{id}/grants/{connectionId}`; `accounts` lists choices),
`reconnect_required` (fix `reconnect`; non-blocking for services the task does not name), `over_cap` (non-blocking;
fix `mention`), `computer_unavailable` / computer `not_granted` (fix `grant_folder`, Mac only), `no_tools`. Only
services **named** in the prompt/brief (or the trigger's) are checked, not generic words. `ready` = AI account selected
and no blocking gap. The plan is a preview: grants can change before Send.

### `GET /activity?cursor&provider&agentId&limit≤100 (default 30)`

Every tool receipt across the account's teammates, newest first → `{"items":[{"id","actionId","runId","agentId",
"agentName","tool","kind","provider","connectionId","accountLabel","status","outcome","actionState","summary",
"providerResourceId","url","createdAt","updatedAt"}],"nextCursor": "opaque|null"}`. Refused calls and writes still
waiting for approval have no receipt and are not listed. Bad cursor → 422 `invalid_cursor`. Owner-only.

### `GET /roster` and `POST /agents/{id}/read`

`GET /roster` → `{"teammates":[{"agentId","name","avatar","brief","archived","status":"idle|<run state>",
"waitingApprovalCount","lastRun":{"id","state","stateReason","terminal","conversationSeq","preview","createdAt","finishedAt"}|null,
"readCursor":"hex64|null","unread","fundingSource","updatedAt"}]}` (≤50, newest activity first). `readCursor` is set only
while the latest run needs attention (finished, `waiting_for_approval`, `waiting_for_signin`); a working run is never unread.
**Per device:** send `X-Vibyra-Device: [A-Za-z0-9._:-]{1,64}` (stable per install) on both calls; without it the
signed-in session is the device. `POST /agents/{id}/read {"cursor": readCursor}` → `{"ok":true}`; 409 `stale_cursor` when
the latest run moved on (refresh, then mark); no-op while nothing needs attention. Replaces the v1-derived status/unread dot
for v2 threads (v1 `/api/agents/v1/.../read` unchanged).

### Attachments

- `POST /attachments` (multipart `file`, ≤2 MB, throttle 30/min, 100/day → 429 `attachment_limit`) → `201 {"attachment":
  {"id","kind":"image|pdf|text","name","mimeType","size","sha256"}}`. Same validation as phone chat attachments: photos
  re-encoded to JPEG ≤1280 px (location data dropped), text must be UTF-8 ≤100 KB, PDFs kept; anything else 422. Stored
  privately; never served to clients.
- Admission/preview: `attachments: [{"id": "uuid"}]` → the run stores the exact metadata above (`{id,…}`); another
  account's or unknown id → 422 `attachment_not_found`. Metadata-only entries (older clients) still pass through.
- Runner: `GET /runner/{runtime}/runs/{run}/attachments/{attachmentId}?generation=N` (runner key) → raw bytes,
  `Content-Type`, `X-Attachment-Sha256`, `nosniff`, `no-store`. Fenced like other runner writes (409 `stale_lease`,
  `run_cancelled`, `run_finished`); 404 unless this run names that attachment. The claim payload's `attachments[]` carry the ids.

### Starter teammates

`GET /templates` → `{"templates":[{"key":"inbox_triage|pr_shepherd|morning_brief|meeting_prep","name","avatar","brief",
"suggested":{"providers":[{"provider","name","operations":[{"tool","kind"}],"why","connected"}],
"schedule":{"recurrence","prompt"}|null,"trigger":{"kind","filter","promptTemplate"}|null},"autoGrant":false}]}`.
`POST /templates/{key}/teammates {"id": uuid (idempotent), "name"?}` → `201 {"teammate": v1 teammate payload, "template"}`
(402 `plan_required`, 404 `template_not_found`). It creates the **profile only**: grants (`PUT …/grants/…`), schedules
(`POST /schedules`, add `timezone`) and triggers (`POST /triggers`, add `connectionId`) each need their own confirmed call.

## 6e. Browser tools — Phase 7 (rebuild Stage 4)

Source: `app/Services/AgentRuns/Browser/*`, `BrowserController`, `routes/agents_v2_browser.php`, Rust
`agent_v2_browser*.rs`. Tests: `AgentV2BrowserToolsTest`; Rust `agent_v2_browser` (headless Chrome, local site).
Flag `AGENTS_V2_BROWSER_ENABLED` (default off; `config/agents_v2_browser.php`).

- **Grant** (per teammate, chosen by the person on Mac or iPhone): `GET /agents/{id}/browser` →
  `{"enabled", "browser": null | {"connectionId","grantId","origins":[…],"generation","updatedAt"}}`;
  `PUT /agents/{id}/browser {"origins": [1–20]}` (bare host → https; no path/query/credentials; localhost,
  private/link-local/metadata IPs, `.local/.internal/…`, single-label names → 422; flag off → 409 `browser_disabled`);
  `DELETE /agents/{id}/browser`. Stored as one `browser` connection (`scopes` = origins) + one V2 grant with every
  browser tool. Changing sites bumps the connection `generation` (every outstanding approval goes stale).
  `PUT /agents/{id}/grants/{browserConnection}` → 409 `browser_grant_sites`. No grant = no tools.
- **Offered** only while the flag is on and the run's runtime snapshot has `capabilities.browserTools: true`
  (the Mac declares it when a Chromium browser exists). Counts toward the 10-tool manifest cap.
- **Tools** (all run on the leased Mac; reads created `approved`): `browser_open {url}` (origin must be granted, else
  refused `origin_not_allowed`), `browser_snapshot {}`, `browser_click {ref}`, `browser_type {ref, text≤2000}`,
  `browser_read {startChar?}`, `browser_takeover_request {reason}`; write `browser_submit {ref, pageFingerprint}`.
  Submit binds the completed snapshot-bearing result in this run with that `pageFingerprint` (else refused
  `stale_page`): exact args `{ref, pageFingerprint, pageUrl, destination, method, submitLabel, fields[{name,label,type,value}]}`
  (password/hidden/secret values `[hidden]`); destination and page origins must be granted.
- **Runner**: `GET runs/{run}/browser?generation` → `{actions:[{id,tool,kind,state,fingerprint,claimedGeneration,
  arguments,expiresAt,browser:{connectionId,generation,origins}}]}`; `POST …/browser/{action}/claim {generation,
  fingerprint}` (rechecks grant, sites generation, fingerprint, expiry, `browserTools`; stale → `refused`
  `grant_revoked`; a submit claimed under an older generation → `unknown`); `POST …/receipt {generation, result}`.
  Receipt: snapshot/page `{url, title, pageFingerprint, elements, forms, …}` (URL must be a granted origin or
  `about:blank`; secret field values re-scrubbed server-side); submit `{submitted:true, destination (= approved),
  url, title, pageFingerprint, screenshotSha256}` → receipt `url` = final URL, resource = screenshot hash; refusal
  `{error, reason: page_changed|origin_blocked|paused|busy|unavailable|refused|not_found|timeout|not_submitted, unknown?}` →
  `failed` (`unknown: true` on a submit → `unknown`, never repeated). Max receipt 30 000 bytes. **Submit receipts are judged
  separately (F-10, §6f): `submitted:true` now needs `observed`, and a receipt that cannot be verified is `unknown` (HTTP 200), never 422.**
- **Mac enforcement**: system Chrome/Chromium over CDP on `--remote-debugging-pipe` (no TCP debugging port; no bundled browser, no Node), a page guard that removes `WebSocket`/`EventSource`/`WebTransport`/`RTCPeerConnection`/`sendBeacon` in every frame and worker (so WebSocket-only sites do not work), private profile
  `<settings>/agent-browser/<sha256(account)[:16]>/<connectionId>` (0700), one controller lease per profile,
  `--proxy-server` to a loopback filtering proxy (`<-loopback>`, QUIC off, WebRTC non-proxied UDP off) that checks the
  granted origin, resolves once, refuses loopback/private/link-local/CGNAT/metadata/v6-local addresses and connects to
  the vetted IP; browser-level Fetch interception fails non-granted origins, non-http(s) schemes and unsafe methods
  (POST etc.) unless an approved submit to that origin is in flight or the person has taken over; popups closed,
  dialogs dismissed, file choosers never answered, downloads denied. Snapshots run in an isolated world; refs are
  re-verified by element signature; clicks refuse submit buttons, covered elements, file inputs and off-site links;
  typing refuses password/OTP/card/captcha fields. Takeover: automation pauses, the window comes forward, the app
  shows the fixed heading "Your teammate is asking you to sign in" and the model's `reason` only as quoted teammate text
  ("Your teammate says: “…”", one plain line, at most 160 characters; F-24) (Tauri event `agent-browser-takeover`; commands
  `agent_browser_takeovers|show|resume`); only Resume (or run end / 15 min) returns control.

## 6f. Security hardening — contract changes from the 2026-09-30 adversarial review

Backend source only, not deployed. Tests are named per item; findings are tracked in `docs/agent-v2-security-review.md`.

### What the Mac runner (`desktop-tauri/src-tauri/src/agent_v2/*`) must change

1. **Authenticate runner routes with the runner key alone (F-03).** Send `X-Vibyra-Runner-Key` and `generation`; stop sending
   `Authorization` on `/runner/*` (it is ignored, so nothing breaks while you migrate). Stop writing the account session token
   into `ctl/broker.json`: it should hold the base URL, runtime id, runner key and run/generation only. Sweep stale
   `$TMPDIR/vibyra-agent-*` folders at launch. `POST /runtimes`, `GET /runtimes` and every client route still need the session
   and must **not** carry `X-Vibyra-Runner-Key` (403 `runner_credential_refused`).
   *Compatibility: key-only is the default. An old runner (Bearer + key) keeps working because the server ignores the Bearer;
   `AGENTS_V2_RUNNER_KEY_ONLY=false` is only a rollback to the old double check.*
2. **No approval fingerprint in tool responses (F-03).** A pending write's `ActionOutcome` has no `fingerprint` (only `expiresAt`).
   The broker never needed it (it polls `GET …/actions/{id}` until decided). Mac computer/browser actions read the fingerprint
   of an *approved* action from `GET runs/{run}/computer|browser` (`actions[].fingerprint`) and echo it in `…/claim`, unchanged.
3. **Never loop a run (F-05).** `POST /complete` no longer refuses a long answer (it is clipped to 60 000 chars with a
   "shortened" notice). For any other non-retryable refusal of `/complete` (422 `empty_answer`, validation errors) or of a
   tool call the runner cannot recover from, post `POST /fail {code:"runner_error", reason:"<fixed text>"}` instead of leaving the
   lease to lapse: the server now ends a run after `max_claims` (3) lapsed-lease re-claims with `failed`/`runner_error` (reason
   "The Mac stopped answering this task 3 times in a row…"; `outcome_unknown` if a write is uncertain). Waits
   (`provider_signin`, `limits`) release the lease and do not count. `fail` reasons should be fixed codes, not stderr tails (F-20).
4. **Browser submit receipts (F-10).** Send `observed: {method, destination}` **only** when the Mac's own network interception saw the
   request leave for the approved destination with the approved method, plus `submitted:true`. If the click dispatched but
   nothing was observed, send `submitted:false` (no `observed`): the server records a definite `not_submitted` (the model may
   propose it again). If anything after the click fails (Chrome gone, network error), send `{error, reason, unknown:true}`. The
   server answers an unverifiable submit receipt (wrong destination, final URL over 2048, origin outside the grant, bad hash,
   receipt over 30 000 bytes) with **200 and `unknown`** (outcome `outcome_unknown`, "Check the site"), not 422; a **422/413 on
   any other receipt is a definite refusal, but after a submit click never treat a non-2xx as "not sent"**: map it to `unknown`.
   `submitted:true` without a matching `observed` is `unknown` (an old Mac therefore records `outcome_unknown` for submits until updated).
5. **URLs (F-09).** Apply the same rule before sending or comparing a page URL (`SafeUrl::page`): http(s) only (`about:blank`
   allowed); drop userinfo and the `#fragment`; drop query parameters named `token|access_token|id_token|refresh_token|auth|code|state|key|api_key|
   secret|password|sig|signature|jwt|session|sid|bearer|credential|ticket|otp|nonce` (or containing token/secret/signature/password/credential/
   x-amz/x-goog) and any value that is a long random-looking string (≥24 chars with ≥6 letter↔digit alternations); replace path
   segments that are JWTs or ≥20-char random-looking strings with `[redacted]`. The server applies it to stored/journalled/model-visible
   receipt and result URLs and to `browser_*` page URLs (so an approved `pageUrl` is already clean); provider links keep their path ids and
   lose only fragment, userinfo and token parameters (a Gmail `#sent/<id>` and a GitHub `#issuecomment-<n>` anchor survive).
6. **Forms (F-06, server half).** A form with more than 30 fields is refused (`invalid_arguments`) instead of being shown truncated.
   The Mac now fingerprints the full serialized form (every form and control on the page, real values, select options, checked state, each button's overrides), so a late field or hidden value invalidates the approval.
7. **Sign-in URLs (F-01).** `url` from any connect `start` (connector install, `POST /connections/{provider}/start`, MCP `signin`, Composio
   `start`) is a **Vibyra link**, `https://<app>/api/connectors/begin/{flowId}`, not the provider page. **No client change is needed:** open it
   exactly as before (iOS `ASWebAuthenticationSession`, Mac external browser) and poll `GET /connections/flows/{flow}`; do not parse it, do
   not prefetch or preview it, and do not require a provider host. The link first shows a Vibyra page (plain HTML, no script, light/dark):
   "Connect <Provider> to the Vibyra account e••••@gmail.com?" with **Continue** and **This isn't my account**. Opening it (GET) sets no
   cookie, redirects nowhere and does not spend the link, so a link forwarded to someone else binds nobody unless that person reads the
   account and taps Continue. Continue (a form POST with the session's CSRF token) spends the link once, sets an HttpOnly, SameSite=Lax
   cookie scoped to that flow's callback path and 302s to the provider; the callback connects nothing unless the browser presents the cookie.
   The page shows only the provider's name and the masked account (email, else display name, else "Guest"). It is never framed and never
   cached. "This isn't my account" ends the flow: the flow reports `failed` with `error: "You cancelled the sign-in."` and the browser goes to
   the `returnUrl` with `status=failed` (the sheet closes), or shows "<Provider> was not connected". A pressed, cancelled or expired link
   answers 404 "already been used or has expired"; a POST with a missing or foreign token answers 419 and leaves the link usable. A browser
   that blocks cookies cannot continue. `GET /connections/flows/{flow}` reports `failed` ("finish in the browser that opened it") for a
   binding mismatch. The person now has one extra tap per connect, inside the sheet, before the provider page. `exp://` return links are
   honoured only outside production and only for loopback, private-network and `.local` hosts. A sign-in that has to be finished on
   another device must be restarted there.

### Server behaviour

- **Journal and refusals (F-13).** Runner `message.delta`/`status` events stop at `max_journal_events` (2000 per run) with one
  `journal.truncated` event; `message.final` and every lifecycle/approval/result event are never dropped. Refused tool calls are stored
  (action row + `tool.refused`) up to `max_refused_calls` (50); later ones get the same `refused` answer but nothing is stored.
- **Deletion and retention (F-04).** Deleting an account purges its V2 run journals, receipts, notification items/deliveries and (via the
  cleanup record, retried by the scheduler) `agent-v2-attachments/<id>/`; connections, grants, schedules, triggers, runtimes, actions and
  browser/computer rows go by foreign key. `vibyra:agent-v2-retention` (daily 03:30) prunes journals of runs finished more than
  `retention.events_days` ago (90), attachment files of runs finished more than `attachments_days` ago (30), uploads never attached after
  `unattached_hours` (48), and orphaned journal/receipt rows; `0` turns a rule off. Receipts are kept.
- **Webhooks (F-11).** A GitHub event is keyed by the SHA-256 of its signed body (the delivery header is unsigned): a redelivery or a replay
  under fresh delivery ids is a duplicate.
- **Identity and validators.** Slack/Notion/Linear account labels carry a short stable provider id (`Acme · T01ABC/U02DEF`) so two
  same-named accounts are different accounts (F-14). Email recipients (`gmail_send`, `outlook_mail_send`, Outlook free/busy) are plain
  ASCII addr-specs: quoted local parts, comments, commas, semicolons, angle brackets and whitespace are refused (F-16). The GitHub read
  validator refuses `.`/`..` in either repository segment (F-17). Literal IPv6/IPv4 hosts are refused for 6to4 (`2002::/16`), `3fff::/20`,
  Teredo, NAT64, IPv4-mapped, site/link-local and the usual private ranges, in both MCP endpoints and browser grants (F-23).
- **Route door (F-30).** Every non-public `/api/agents/v2` route passes `AgentV2Credentials` (`user`: a Bearer token and no runner key;
  `runner`: a 64-character runner key) before its controller; the public routes are the two webhooks, the two callbacks and the client
  metadata document. Receipt size bounds (413) also measure the received body, not just `Content-Length` (F-28).

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

## 7. Limits (config/agents_v2.php)

lease 90 s · online window 120 s · approval TTL 900 s · ≤10 tools · ≤40 tool calls/run ·
prompt ≤20 000 chars · ≤8 attachments · event payload ≤8 KB · tool result ≤32 KB · answer ≤60 000 chars (clipped with a notice) ·
3 attempts when a lease keeps lapsing (`max_claims`) · ≤2 000 journal events/run for streamed text and status (`max_journal_events`) ·
≤50 stored refused tool calls/run (`max_refused_calls`) · finished runs' journals kept 90 days and attachment files 30 days
(`retention`, daily `vibyra:agent-v2-retention`; receipts stay).
Routines: catch-up window default 60 min · ≤50 schedules and ≤25 triggers per account · trigger rate cap 1–60 runs/hour (default 10).

## 8. Not in this slice

Live provider acceptance for Stage 2 and Stage 3 (all provider, remote MCP and Composio behaviour above is proven only with Http::fake fixtures; Composio isolation is unverified), hub/MCP client UI, live local (stdio) MCP acceptance (§6g is fixtures and a node fixture server only), live Microsoft 365 acceptance, GitHub
reconciliation after an unknown write, per-grant repository/calendar allowlists, notification
delivery (hooks only), live schedule/trigger acceptance (wall-clock run, real GitHub/Gmail deliveries), browser,
SSE/streaming push, real-queue/Postgres concurrency tests, Tauri allowlist entries for these
routes (client work), legacy history import, and retirement of `/api/agents/v1` execution.

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

