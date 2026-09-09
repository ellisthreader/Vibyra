# iOS Conversations

The native iPhone conversation view is implemented for newly created Codex
sessions when `host.state.capabilities.conversationV1` is true. Creation sends
`runner:"conversation"`; existing Codex/Claude/shell PTYs keep their original
runner. Web/Android show an honest iPhone-only fallback for structured sessions.
No Tauri desktop UI or account/cloud inference integration is included.

Ownership: `mobile/src/conversation/` renders messages, grouped activity, inline
questions/permissions and results. `ui/ConversationSessionScreen.tsx` integrates
the keyboard-aware composer, turn Stop, project review and session details.
`state/conversation*.ts` owns wire state, replay/snapshot reconciliation, scoped
requests and selection continuity. `mobile/src/theme.ts` owns the palette.

Host implementation is `host/crates/engine/src/conversation/`; the additive wire
contract is `host/docs/conversations.md`. It starts Codex app-server with local
CLI login, workspace-write and user-reviewed on-request permissions. Credentials
stay on Host. A dedicated `vibyra_ask_user` dynamic tool provides questions during
ordinary coding mode: the built-in question tool is not available there merely
because developer instructions ask for it. Dynamic calls acknowledge through
item completion; ordinary approvals use serverRequest/resolved.

Controls require the current authenticated device, lease, generation, project,
request and exact action version. Decision/submission receipts persist before
dispatch; unknown outcomes never automatically repeat execution. Accepted
permission is not proof of execution. Provider refusal, loss of control, stop
and expiry remain visible. Unsupported/broader approvals fail closed.

Host batches token deltas and retains bounded SQLite history/events. Snapshot
pages use stable item order; cursors identify updates. The phone reconciles
snapshot races, gaps and final lifecycle state. Host restart interrupts processes
without respawning them. Current project diffs are not task-owned artifacts.
No inferred test success, automatic undo, execution resume, queue or steering.

iOS drafts opt into app-private file storage through `ui/draftStorage.ios.ts`;
legacy and sample drafts remain memory-only. Keys stay in SecureStore. Returning
from a background suspension reconnects the same trusted Host and restores the
exact selected conversation, without automatically taking control. Offline views
retain last-known content and disable mutations.

Validation evidence and commands: `docs/ios-conversation-validation.md`.
Use `node scripts/verify-conversation-ui.mjs` from mobile for shared-renderer
fixtures; `serve-native-conversation.mjs` serves an isolated Expo manifest for
native fixtures without replacing App.tsx or interrupting normal Metro. The plan
skill records this workflow. Browser fixtures, simulator captures, real provider
probes and Host tests are distinct evidence; physical-phone lock/network and
VoiceOver acceptance must be reported separately. The detailed design record is
`docs/ios-conversation-experience-plan.md`.

`verify-native-conversation.mjs` has passed a real Simulator → production
RuntimeBridge/Noise → isolated Host → Codex completed turn. It caught WKWebView
blocking `ws://` from an HTTPS origin; iOS now uses a localhost HTTP document
origin while preserving encrypted transport and Host trust. The Expo diagnostics
skill records this native-only failure and the isolated verification workflow.
