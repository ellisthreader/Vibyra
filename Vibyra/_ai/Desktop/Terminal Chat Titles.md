# Desktop - Terminal Chat Titles

Read this for terminal names that should describe an AI conversation rather
than repeat the model or project folder.

## Confirmed Regression

- Release commit `88a5aa2` (0.1.8) introduced prompt-derived titles by feeding
  xterm's public `onData` stream into `TerminalPromptTracker`. The stream was
  documented as user keystrokes, but it also contains replies xterm generates
  for terminal queries. Codex's OSC 10/11 colour replies therefore became
  printable prompt text and were persisted as names such as
  `]10;rgb:...\]11;rgb:...\` when the user next pressed Enter.
- The same malformed values were present in the live `session.json`, and
  replaying the old parser against Codex's exact startup replies reproduced
  them. Diagnose this as protocol-frame contamination, not random model output.
- Codex's exact startup query batch is in its binary verbatim:
  `ESC[6n ESC]10;? ST ESC]11;? ST ESC[?u ESC[c`. xterm answers the colour
  queries through `coreService.triggerDataEvent`, whose `wasUserInput` defaults
  to false — which is why the replies reach `onData` alongside real keys.

## The Second Cause: Keystrokes Are Not The Prompt

Filtering the protocol frames was necessary but not sufficient. Verified
against the live `session.json` after the filter shipped: two Codex panes whose
real prompts were "Can you run the mobile app, please?" and "Can you find the
codex chat from last night…" were both named `permissions`, and one of them had
never displayed that word at all.

Reconstructing a prompt from `onData` cannot work here:

- Voice dictation writes through `writeTerminal`, straight to the PTY, so a
  dictated prompt never passes through the keyboard at all.
- What the tracker does see is TUI navigation — approval dialogs, `/`-menus —
  which it cannot tell apart from a submitted prompt.
- A resumed pane has nothing typed in it, so it can never recover a name.

Codex writes every submitted message to its rollout as it goes, so that file —
not the keyboard — is the source of truth. `pty/chat_prompt.rs` reads the first
user message from it, skipping the `# AGENTS.md instructions` and
`<environment_context>` blocks Codex injects as user messages, and unwrapping
the `<image …>` / `[Image #n]` markers a pasted screenshot leaves in front of
the words. `pty/conversation.rs` already located that file for resume; it now
returns the path as well as the UUID.

## Provider Difference

- Claude Code 2.1.241 has its own `generate_session_title` / `ai-title` flow,
  persists the generated summary, and publishes it as a terminal OSC title.
  Preserve that native path.
- Codex 0.149 emits generic project/spinner OSC titles and does not currently
  populate its optional thread `name` field. Vibyra must not wait for a
  Claude-equivalent Codex title. Recheck both CLIs after provider upgrades.
- The non-Claude fallback is deliberately local: derive and redact a concise
  title from the first substantive submitted prompt. Do not add a hidden paid
  model request merely to name a pane.

## Runtime Contract

- xterm's `onTitleChange` path is provider-neutral and remains the source for
  Claude Code, which emits chat-aware OSC titles. Codex also emits OSC, but its
  values are generic cwd/spinner labels; do not diagnose those as a broken
  xterm listener.
- `src/lib/terminalChatTitleSource.ts` owns which of the two sources names a
  pane. It sweeps unnamed panes every 5s, asks `agent_chat_prompt`, and gives
  up on a pane after 12 misses. A pane with a readable transcript stops using
  the keystroke fallback entirely; `acceptedChatTitle` lets a transcript name
  replace a keystroke guess, and never the reverse.
- `src/lib/terminalChatTitle.ts` turns a prompt into a bounded title, and is
  the fallback for every non-Claude AI CLI without a readable transcript —
  Gemini, Qwen, Aider, OpenCode, custom agents, and Codex on Windows/macOS,
  where `/proc` does not exist. `terminalPromptTracker.ts` holds the line
  editor it feeds on. Shell and SSH never use this path.
- Dictated prompts are handed to the fallback explicitly by `voiceStore`,
  because they bypass xterm. Title text drops a trailing courtesy and skips a
  dictated false start ("Can you… Can you make it so…").
- xterm's `onData` is not keyboard-only: terminal query replies also travel
  through it. Codex issues OSC 10/11 foreground/background colour queries, so
  `TerminalPromptTracker` must consume complete and chunk-split OSC/DCS/CSI/SS3
  protocol frames before reconstructing the prompt. Otherwise the next title
  begins with raw `]10;rgb:...` bytes; any non-Claude AI CLI can trigger the
  same failure.
- Display precedence is manual `customTitle`, generated `chatTitle`, raw `osc`,
  then the launch `title`; `src/lib/terminalTitle.ts` owns that rule. The
  generated title is persisted in `session.json` and carried through resume,
  restart, and account switching.
- Machine-derived titles are normalized at store/display boundaries, and
  `sessionRestore.ts` drops protocol-corrupted legacy `chatTitle` values on
  both restore and save. This repairs already-saved panes while leaving manual
  titles and valid Claude OSC titles unchanged.

## Validation

Run `npm --prefix desktop-tauri test`, `npm --prefix desktop-tauri run build`,
`npm --prefix desktop-tauri run lines`, and the native `session_store_tests`.
Focused coverage is `desktop-tauri/tests/terminalChatTitle.test.mjs` (prompt
to title, and the protocol filter) and `terminalTitleRules.test.mjs` (which
name a pane shows, and which may replace another).

To check the real thing rather than fixtures, read `chatTitle` for each Codex
pane out of `~/.config/vibyra-desktop/session.json` and compare it against the
first user message in that pane's rollout — `agentSessionId` names the file.
Titles that are identical across two different conversations mean the keystroke
fallback is naming panes again.

For a runtime regression check, launch a real Codex pane and inspect the saved
pane after startup and after its first prompt. Startup must leave `chatTitle`
null even though the snapshot contains OSC 10/11 queries; the submitted prompt
must then create the readable title, which must survive an app restart. Also
seed a malformed legacy `chatTitle` and confirm restore drops it.
