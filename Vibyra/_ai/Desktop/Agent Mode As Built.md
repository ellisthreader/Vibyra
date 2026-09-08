---
title: Agent Mode As Built
area: desktop-tauri
updated: 2026-09-04
status: shipped in 0.4.3; subsequent audit identified unresolved authority and recovery gaps
---

# Agent Mode As Built

Deep reference for implementation history. Start with
`Agent Mode Audit Boundaries.md` for the verified release mapping and the
2026-09-04 findings; this historical description is not enterprise sign-off.

What Agent Mode actually is in the code, as of 2026-09-03. Read this before
touching `desktop-tauri/src/components/agentMode/` or
`desktop-tauri/src-tauri/src/agent_mode/`.

## The three modes

The titlebar switch (`ModeSwitch.tsx`) is Agent · Code · Chat. Code Mode is
hidden with `hidden`, never unmounted, because its panes hold live PTYs.
Agent and Chat mount on demand inside `.shell__mode` (`display: contents`).

0.4.2 gated Agent and Chat behind a "work in progress" policy
(`workspaceModePolicy.ts`). That file and its test are deleted; there is no
gate left anywhere. `.agent-main` must carry `flex: 1` or it shrinks to its
content and leaves two thirds of the window bare.

## What a teammate is

A row in `agents.db` (SQLite under
`<config>/vibyra-desktop/agent-mode/<account>/`). It owns a brief, a
permission level (plan / standard / full), an engine (Claude Code or Codex),
a home folder that is always granted read-write, further granted places,
memory entries, assigned skills, an allowlist of peers it may hand work to,
routines, and chats. Every chat with it shares all of that and nothing else.

## Decisions: how a card is really raised

Two producers fill the queue. Both were dead before this branch.

1. **Handoffs.** `agent_mail_send` gets `Delivery::NeedsApproval` when the
   note contains an escalation phrase (publish / spend / delete). It now
   raises a `mail.handoff` card through `approvals::request`, links it to the
   message (`agent_mail.approval_id`, migration 2), and emits
   `approval-raised`. `approval_resolve` delivers the handoff on approve
   (marks delivered, wakes the recipient) or marks it refused.

2. **Claude permission prompts.** Every Claude turn is launched with
   `--permission-prompt-tool mcp__vibyra__approve --mcp-config <inline JSON>`.
   The MCP server is the Vibyra binary itself in `--permission-bridge` mode
   (`agent_mode/bridge/`), which speaks JSON-RPC on stdio and forwards each
   question over loopback TCP to the gate (`agent_mode/gate/`), a listener
   bound to `127.0.0.1:0` at app start with a per-process token. The gate
   classifies the tool call (`approvals::classify`, `bash_risk`), allows
   reads, allows file writes inside a writable grant without a card, refuses
   what `forbidden()` refuses, and otherwise raises a card and **blocks the
   MCP reply** until `approval_resolve` notifies the waiter, the turn is
   cancelled, or 30 minutes pass (then the card expires and Claude is told
   nobody answered).

**The finding this rests on (claude 2.1.258):** `--permission-mode
acceptEdits` never consults the prompt tool, not even for `rm -f`. A bridged
turn therefore runs in `manual` mode; an unbridged one (gate failed to bind)
falls back to `acceptEdits`. See `claude::permission_mode`. Neither ever
uses `--dangerously-skip-permissions`.

**Orphans.** No turn survives the app closing, so `AgentHub::open` calls
`approvals::invalidate_orphans` next to the existing `reset_running` calls:
every pending card with a `turn_id` is invalidated at startup. Handoff cards
have no turn and survive. Without this a dead turn's card sat in Decisions
offering an Approve that notified nobody.

Verified live on 2026-09-03: a Release teammate asked to `rm -f` its own
scratch file produced a Destructive card inline in the chat, in Decisions,
in the rail badge and as a toast, within ten seconds of Send.

## Gate hardening before 0.4.3 shipped (review findings, 2026-09-03)

- `read_only` in `shell_patterns.rs` refuses to call a line a read if it
  contains `$(`, a backtick, `<(`/`>(`, `|&`, `find`'s `-exec/-execdir/
  -delete/-ok`, or `system(`; a lone `&` splits a segment like `;`. Before
  that, `find . -exec rm -rf {} +` was a "read" and allowed with no card.
  `/proc/` is a Secret pattern (another process's argv holds the token).
- `decide.rs` refuses a `file.write` outright when the subject may not
  write (Plan level, or Chat Mode with nothing mounted). Before, a card was
  raised and Approve allowed the path without any grant check.
- `ModeErrorBoundary` wraps Agent and Chat Mode in `WorkspaceApp.tsx`; a
  crash there no longer unmounts the hidden Code Mode terminals.
- Listener: 64 KiB question cap, backoff on accept errors, constant-time
  token compare.
- Known and accepted: the bridge token travels in Claude's argv via
  `--mcp-config` (readable by same-UID processes; other users on a
  multi-user machine could read `/proc/<pid>/cmdline`). It is a verdict
  oracle, not an execution path; a holder can only raise fake cards.

## The event wire format (fixed 2026-09-03)

`AgentEvent` in `agent_runtime/events.rs` is flattened into `ChatEventRow`,
whose `rename_all = "camelCase"` never reached the flattened fields. So
`call_id`, `exit_code`, `cost_usd`, `input_tokens`, `skill_id`,
`approval_id` and `session_id` crossed to a frontend reading `callId`,
`costUsd`, … Every tool block was keyed `tool-undefined`, tool output never
filled its block, and the first completed turn crashed `TurnFooter` on
`undefined.toFixed` and blanked the whole app. Each field now carries
`#[serde(rename = "camelCase", alias = "snake_case")]`: new rows and live
events are camelCase, rows stored before the fix still deserialise.
`events_wire_tests.rs` pins both directions. `events_bounds.rs` holds the
text clamping that was split out to keep the enum file under 200 lines.

## The UI vocabulary

Everything in `agentMode/` is built from shared classes; there is no
private button or modal language any more.

- Panels: `.panel > .panel__inner` (940px measure), `PanelHead`
  (`.panel__head`), `.panel__section` + `.panel__section-head` +
  `.panel__count`, `EmptyState` (`.empty`), `.rows > li > .row` lists
  (`agent-lists.css`), `.panel__cards` for decision cards.
- Dialogs: `EditorDialog` wraps `.modal-backdrop / .modal.modal--narrow /
  .modal__header / .modal__body / .modal__foot`, with `.field` +
  `.input` for form fields. New teammate, new routine and skill editor all
  use it.
- Buttons: `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--danger`,
  `.btn--sm`; `.icon-btn`. Status dots: `.adot.adot--working`.
- Teammate settings: `.settings-block > .section-label + .settings-group >
  .setting-row` exactly as the app's Settings dialog.
- The roster row is `.roster-row` (was `.agent-row`, which collided with
  Settings › Custom agents).
- `AgentSurface` must add `agent-surface--wide` when the chat rail is not
  shown, or Settings and Skills render inside the 240px rail column.
- A chat parked on a decision shows the `ApprovalCard` inline above the
  composer (`.chat-surface__decisions`).

The Claude adapter summarises a tool call by its human field (`command`,
`file_path`, `pattern`, …) rather than the input JSON, and tool results
that arrive as content blocks by their text.

## GUI verification recipe

Xephyr `:99` + `dbus-run-session` + scratch `XDG_CONFIG_HOME`, launched
with `VIBYRA_DEV_ACCOUNT=1` (a **temporary** harness in `account_auth.rs`
that must not ship). Mouse via `xdotool` works; **typed text does not reach
WebKit inputs** on a bare Xephyr (no window manager, so the toplevel is
never "active"). Launch with `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9224`
and drive the DOM over the inspector websocket
(`ws://127.0.0.1:9224/socket/1/2/WebPage`, commands wrapped in
`Target.sendMessageToTarget`), setting values through the native setter and
dispatching `input`. Background processes started from a Claude Code
session die at the turn boundary; relaunch with a script.

## Deliberately not built

- The plugin gateway (schema only; no connector ships).
- A second model call for reflection.
- Any "don't ask again" for outward effects: `trustable` is false for
  destructive, spend, publish and secret at every level.
