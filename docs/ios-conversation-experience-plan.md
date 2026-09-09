# Vibyra iOS conversation experience

Reviewed 9 September 2026. Status: implemented for new iOS Codex conversations on
capable Hosts; physical-device acceptance remains pending. Current evidence is in
[the validation record](ios-conversation-validation.md). The following sections
retain the design rationale and original checkpoints; current wire details live
in `host/docs/conversations.md` and ownership in the iOS Conversations memory note.

## Outcome and scope

Make coding from an iPhone feel like a calm conversation: readable responses,
compact live activity, inline questions and permissions, and useful results.
Use the maintained Expo app in `mobile/`. Product UI changes target iOS only;
use a native platform entry/gate so Android and web retain existing behaviour.
Web fixture harnesses may exercise shared components for development.
No Tauri desktop UI, marketing, account, billing, or cloud-coding redesign.

The existing standalone `host/` needs additive agent/protocol support for this
iPhone feature. A phone-only rendering change cannot deliver reliable structured
approvals. Keep provider credentials and execution on Host; preserve current
pairing and control authority. This work does not make the paired shell a sandbox.

## Reference review

- OpenAI documents messages, tool activities, streamed item lifecycles, approval
  decisions, questions, and turn interruption in its
  [Codex app-server contract](https://learn.chatgpt.com/docs/app-server).
  Those distinct events provide a foundation for distinct UI treatments.
- Cursor places work in an Agent conversation, supports stopping work and
  queuing follow-ups, and exposes edits through a diff review surface.
  [Agent interaction](https://prod.cursor.com/help/ai-features/agent).
- Cursor separates execution permission policy from the conversation. Current
  approval behaviour depends on its configured run mode; it does not simply
  ask permission for every command.
  [Terminal integration](https://prod.cursor.com/help/ai-features/terminal).
- Cursor encourages inspecting live changes and reviewing completed work.
  [Reviewing and testing](https://cursor.com/learn/reviewing-testing).

This is a documentation and Vibyra source review, not direct inspection of the
user's installed ChatGPT or Cursor UI. Spacing, activity grouping and mobile
compositions below are design recommendations, not claims about private internals.
Cursor is a UX reference; adding a Cursor runtime is outside this plan.

## Current Vibyra baseline

`mobile/src/ui/SessionScreen.tsx` forces live sessions through TerminalSurface
even when Chat is selected. Only `demo/DemoConversation.tsx` renders rich
messages/results/decisions. Reuse its visual primitives, not its sample state.
`ui/types.ts` has no live turn/message model. `state/WorkspaceStore.ts` accepts
protocol 1, clears selection on disconnect, and routes terminal output.
`state/workspaceActions.ts` submits raw terminal input; its approval method does
not establish Host support. `host/docs/protocol.md` explicitly reserves and
rejects structured approval resolution. `host/crates/engine/src/launch.rs`
launches interactive Codex/Claude PTYs. A new structured runner is required.
`mobile/src/theme.ts` is the actual current palette source; old root theme paths
in historical design notes are not implementation targets.

## iPhone layout and behaviour

| Surface | Proposed treatment |
| --- | --- |
| Header | One compact title row with chat navigation and overflow; computer/project context available on tap |
| Conversation | Native virtualized list; subtle user bubble; assistant text on the canvas with minimal repeated branding |
| Live work | One activity group per turn, showing the active operation and completed count; tap to expand ordered details |
| Permissions | Inline card: action, reason, affected project/path or destination, scope, equally reachable Allow once and Decline |
| Questions | Inline card with two or three choices where suitable, free text, and explicit Submit |
| Results | Short outcome, actual check status, and Review changes; Preview only when a live capability exists |
| Composer | Stable keyboard-aware input; Send when idle, Stop while working; keep draft editable while waiting |
| Technical details | Commands, output and diffs in expandable rows/sheets; raw Terminal remains accessible from overflow |

Example turn: user asks to fix login → “Checking the login flow…” → compact
“Read 4 files” activity → a question if needed → “Updating the form…” → permission
card only if execution policy requires one → result with checks and changes.
Do not narrate each command in a chat message. Keep brief commentary for material
findings or a change of direction. Never discard the full activity history.

Use Graphite/Cobalt from the existing theme context, system typography, 16–17 pt
body text with comfortable line height, 20 pt horizontal padding, and 44 pt
minimum targets. Neutral surfaces dominate; cobalt marks primary actions.
Cards are for decisions and results, not every paragraph. Support light/dark/system,
Dynamic Type, VoiceOver, Reduce Motion, landscape and small iPhones.
Use short opacity transitions; avoid continuous decorative animation.

Follow the stream only while the reader is near the bottom. Otherwise preserve
position and show a small new-activity button. Do not collapse a group the user
opened or move an active question while they type. Announce status transitions
to VoiceOver, not every streamed token. Long diffs open a full-height sheet.

## Implementation checkpoints

### 1. Prove the structured runtime contract

Start with Codex because the required app-server contract is documented. Verify
the installed version and generate its matching schema. Prove a real turn with
streaming, an approval accepted/declined, a question answered, and interruption
against an isolated project before enabling the live phone UI.
Define provider capabilities: structured chat, approvals, questions, interruption,
steering, task diffs and resume. Claude remains usable through its existing
terminal until a documented adapter passes the same contract tests. Investigate
its official SDK/control interface as a separate provider checkpoint; do not
infer interactive approvals from a text/JSON output flag. Existing sessions stay
on their original runner. Never launch a second agent to populate a new view.

### 2. Add Host-owned conversations and request handling

Add focused modules under `host/crates/engine/src/` for runner adapters,
conversation state, event storage, and pending decisions. Keep PTY modules intact.
Host wraps provider events in a versioned neutral envelope containing host,
project, session, generation, turn, item and monotonic cursor identities.
Items cover messages, activities, questions, permissions and results; maintain
separate process, turn and connection states. A live process is not a busy turn.

Add capability negotiation compatible with protocol 1 clients. Proposed methods:
`conversation.snapshot`, `conversation.events`, `turn.submit`, `turn.interrupt`,
`decision.resolve`, `question.answer`, and submission-status lookup. Final names
and schemas are fixed at this checkpoint. Snapshots include outstanding requests.
Subscribe before snapshot; reconcile by cursor and item identity. Persist a bounded,
paged journal on Host; enforce the existing 60 KiB transport frame budget.
Do not upload transcripts into legacy account/cloud storage.

Persist submission/decision IDs before dispatch. Duplicate taps return the stored
result. Bind each decision to exact action content/version, request, generation,
session and authorized controller. Reject stale or changed actions and conflicting
second decisions. Mark a response complete only after provider acknowledgement.
After a crash with uncertain delivery, reconcile provider state or show unknown;
never blindly repeat execution. Pending/accepted/executed are different states.

### 3. Build the reusable iOS presentation

Create focused `mobile/src/conversation/` types, reducer/store, list, message,
activity, permission, question and result components. Keep source files at most
200 lines. Route iOS structured sessions from SessionScreen; reuse Composer,
Sheet and ReviewSheet where their semantics match. Preserve the current shell
experience and unsupported-provider fallback with honest capability copy.

Drive all live states from Host events. Derive labels such as “Reading files”
from verified tool categories; use “Running command” when purpose is unknown.
Do not add an extra model call for every label, parse ANSI to invent approvals,
show invented percentages, or infer success from silence/process exit alone.
Batch token rendering and bound expanded output to keep scrolling responsive.
Use fixtures through this same renderer, clearly separated from live data.

### 4. Connect questions, permissions and composition

Question responses include question/option IDs and validated free text. No answer
is submitted merely because it is highlighted. Dismissing details does not decline
or approve. Show one active request and an honest remaining count when several
exist; preserve each request separately. An optional reminder above the composer
returns to a pending card when it is offscreen.

Permission copy must include meaningful action and scope; exact commands/diffs
remain inspectable. Respect already granted policy and explicit task authority.
Do not introduce a second approval after the provider already performed an action.
Only offer session-scoped grants if the adapter enforces their exact scope.
Pairing/taking control and OS permissions remain separate from agent decisions.
Observer phones can read requests; only the authorized controller can resolve.

Send submits a structured turn, never a terminal keystroke. Preserve the existing
new-chat draft handoff until the user explicitly sends. While busy, keep Stop
available and preserve the next draft; add queue/steer only where the adapter
provides acknowledged semantics. Interrupt the turn without killing the entire
session; session termination remains a separate action in session details.

### 5. Make phone lifecycle and results reliable

Persist native drafts and selected chat identity scoped by host/project/session.
Use an appropriate protected local store; SecureStore remains for small secrets,
not large transcripts. Show cached content as last-known while disconnected.
Foreground reconnect restores the exact conversation, reconciles events and
pending decisions, and reacquires control explicitly. Do not promise a persistent
background socket or automatic execution resume after Host restart.

If approval delivery is uncertain, show “Checking your response…” until Host
reconciles; prevent duplicate action. Revocation, lease loss, expired requests,
provider failure and generation changes disable stale controls with useful copy.
Backgrounding never grants permission. A pending action remains pending or expires.

Review changes must distinguish task-owned edits from all project changes. Keep
the existing project diff labeled as such until task provenance is available.
Record actual check commands, outcomes and turn identity. No “All checks passed”
without evidence. Checkpoint restore/undo needs ownership and conflict handling;
do not add it in this first release. Live preview remains capability-gated.

### 6. Verify and enable the iPhone experience

Contract tests: real provider plus deterministic adapter fixtures; accepted,
declined, cancelled, expired and duplicate requests; wrong device/project/turn;
provider crash, dropped acknowledgement and restart. Assert actual file effects
and that declined operations never execute. Preserve existing PTY integration tests.

State tests: out-of-order/duplicate events, snapshot races, cursor gaps, session
switching, long transcripts, draft persistence, no automatic input retry, and
no completed/test-passed state without an authoritative event.

iOS acceptance: 375×667 and 430×932 layouts, both themes, keyboard open, large
text, VoiceOver, Reduce Motion, long output and diff sheets. Capture idle, running,
question, permission, denied, completed, error and reconnect states. Validate on
the simulator and a physical iPhone with lock/unlock and network loss/recovery.
Remote/mobile-data claims require a separately proven transport path.

Run `npm run check:mobile`, `npm --prefix mobile run export`, focused Host tests,
existing Host UI integration and mobile entrypoint checks. Web harness evidence
supplements native evidence. Regression-check existing web/Android routing and
protocol 1 clients; no desktop UI changes are needed. Gate rollout by iOS platform
and Host/provider capability; start with new Codex conversations, then enable
Claude only after its adapter passes. Preserve existing terminal sessions.

## Plan review and completion boundary

The smallest reliable delivery is one native conversation renderer, one neutral
Host event contract, and one proven provider adapter. Reuse transport, theme,
pairing, file review and navigation. Avoid new dashboards, global permission
inboxes, automatic summary services, and a duplicate conversation backend.

The design can be reviewed first with fixtures, but delivery is complete only
when real iPhone-to-Host work streams, asks, resumes and finishes correctly.
Public-service authorization/sandbox work from the master plan remains separate.
No implementation timing or seamless-operation claim is justified until the
runtime spike and physical-device acceptance pass.
