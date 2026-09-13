# Structured conversation extension (version 1)

Additive to protocol 1. `host.state.capabilities.conversationV1:true` advertises
Host support. Only an explicit `session.create` with `runner:"conversation"` and
`kind:"codex"` starts the structured runner. The returned Session retains that
runner field. Older clients/providers and existing sessions retain their PTY.
Codex app-server uses local CLI login, `workspace-write`, `on-request`, and the
user approval reviewer. API-key environment variables are removed as with PTYs.
No transcript is uploaded to Vibyra's account/backend services.

`session.claim/release` and disconnected-controller revocation apply unchanged.
Every conversation mutation includes `sessionId,projectId,generation,lease`;
Host validates the authenticated device and current lease before dispatch.
`session.stop` ends the process; `turn.interrupt` interrupts only the current turn.
A structured session has no terminal keystroke input or PTY rendering.

## Wire methods

- `conversation.snapshot {sessionId,beforeCursor?}` returns
  `{sessionId,projectId,generation,cursor,processState,turnState,turnId,items,pending,hasMore}`.
  `items` is a bounded chronological page; pending requests are also returned
  separately. Deduplicate by item ID. Older pages pass the oldest item's `order`
  as `beforeCursor`. `order` is stable insertion order; item `cursor` is its most
  recent change, and envelope `cursor` is the conversation's monotonic cursor.
- `conversation.events {sessionId,afterCursor}` returns
  `{events,cursor,generation,resetRequired}`. A missing retained range or future
  cursor requires a fresh snapshot. Responses can contain only part of the
  replay; continue from the last returned event cursor.
- `turn.submit {...control,submissionId,text}` returns
  `{submissionId,status,turnId,message?}`. Status is `accepted`, `failed` (definitive provider rejection), or `unknown`;
  duplicate identical IDs return stored status (including `dispatching`).
- `turn.submissionStatus {sessionId,submissionId}` reads the submitting device's
  durable receipt, or explicit `notFound` when no submission was recorded. Never retry an unknown submission under a new ID.
- `turn.interrupt {...control,turnId}` returns `{accepted:true}` after provider
  acknowledgement; final stopped state comes from `turn/completed`.
- `decision.resolve {...control,requestId,actionVersion,decisionId,decision}` with
  `decision:"accept"|"decline"` returns `{decisionId,status}`.
- `question.answer {...control,requestId,actionVersion,decisionId,answers}` uses
  `answers:{[questionId]:{answers:string[]}}`; choices are provider option labels.
  Free text is accepted when the provider allows Other or supplies no choices.

`conversation.updated` events carry snapshot identity/state plus `item` (nullable),
for upsert by ID. Clients subscribe before taking a snapshot, reject older cursors,
and resnapshot on gaps and final/process state changes (which also expire requests).
Process state is `running|interrupted` (`exited` reserved); turn state is
`idle|running|waiting|completed|interrupted|failed`. Process alive does not mean busy.

Items contain `id,kind,turnId,status,cursor,order`, and appropriate optional fields:
`role,text,title,detail,category,exitCode,truncated,requestId,actionVersion,questions,scope`.
Kinds: message, activity, permission, question, result. Request items also retain
exact provider `action`, `method`, `rpcId` for Host validation; do not render these
as presentation copy. Statuses include running/completed/failed/interrupted,
pending/responding/accepted/declined/expired/unknown. Accepted permission means
provider acknowledgement, never proof of execution or test success.

## Durability and failure boundaries

Local SQLite stores at most 512 retained items and 128 replay events per session,
plus at most 4096 immutable submission/decision receipts. At the receipt limit,
start a new chat. Pages/replay stay below the 60 KiB transport budget. Long display
items are capped at 8 KiB and marked truncated; this is bounded history, not an
unlimited transcript archive. Full oversized approval content is never approved.
Only two provider requests can be outstanding at once; unsupported or oversized
requests fail closed through a JSON-RPC error. Supported approvals are complete
command actions and file changes without session-wide grants. Broader permissions,
network-policy amendments, MCP elicitation and credential requests are unsupported.

Receipts are persisted before provider dispatch. Repeated identical decisions
return their original state; changed actions/answers and conflicting decisions
are rejected. Requests stay `responding` until `serverRequest/resolved`. Default-mode questions use the registered `vibyra_ask_user` dynamic tool; its matching `item/completed` acknowledges the answer. Unknown
responses never resend. Host restart expires pending requests, preserves unknown
receipts, marks running work interrupted, and never respawns the provider.
There is no automatic execution resume, queue/steer, task-owned diff, undo, or
check-success inference. Existing project diff remains project-wide.

Validation uses installed Codex 0.153.4's generated JSON schema and engine tests
with a real subprocess adapter fixture. Native-device and live-provider acceptance
are separate evidence; see the implementation status before claiming rollout.

Assistant text and live command output deltas coalesce on a 50 ms timer before persistence and broadcast; lifecycle
and decision events flush immediately. Live opt-in Engine acceptance tests cover
real streaming, a default-mode dynamic question/answer, and persisted recovery.
