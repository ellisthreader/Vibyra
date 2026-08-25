# Agent Prompt Notifications

Scope: how a pane's "needs you" notice learns what the agent is actually
asking, and how a toast can answer it without a second permission system.

## Why It Exists

`activity.ts` detects attention with one regex over the last 220 characters of
ANSI-stripped output. That is enough to know *something* is waiting and nothing
more, so the toast used to read "needs you / It is waiting on an answer before
it can carry on" for every prompt — including a Codex sandbox-escalation ask
naming a specific command.

## The Three-Part Split

The feature was deliberately cut into three, and only two were built:

1. **Richer copy** — read the prompt, name the command. Read-only, no new
   failure mode: a bad parse just falls back to the old wording.
2. **Approve / Decline buttons** — feasible via `write_terminal`, but only
   behind a staleness guard (below).
3. **Vibyra-level auto-approve — NOT BUILT, and should stay unbuilt.** The
   agent's own "don't ask again" is scoped to a command prefix *the agent*
   computed. Vibyra cannot reproduce that scope, so a second always-allow list
   would either be a wrong-scoped copy or a coarse "sandbox off" with a
   friendlier button. `intentOf` classifies those options as `remember` for the
   express purpose of never putting one on a button; the trailing text button
   changes to "More options" so the route back to the pane is visible.

## Source Ownership

- `src/lib/agentPrompt.ts` — pure parser. Given logical lines, returns
  `AgentPromptOffer` or null. Never touches a terminal.
- `src/lib/agentPromptIntent.ts` — the language rules: what an option *means*
  (`affirm` / `decline` / `remember` / `other`) and how it reads on a button.
  Split out because phrasing changes more often than block shape.
- `src/lib/agentPromptScan.ts` — the only impure half. Reads the xterm buffer,
  and is the single place a toast can reach the PTY.
- `src/components/notifications/ToastPrompt.tsx` + `styles/notifications-toast-prompt.css`
- `src/notificationTypes.ts` — `AgentPromptOffer` lives here because that file
  is the bottom of the dependency graph and must keep importing nothing.
- Tests: `tests/agentPrompt.test.mjs`.

## Three Rules That Are Load-Bearing

**Parse lazily, at the attention edge — never per output batch.** The ticker
has already waited out 2.5s of silence before `scanAgentPrompt` runs, so this
costs a buffer walk an hour, not one per write. Extending the per-chunk regex in
`activity.ts` instead would put a parser in the hot path of every build log.

**The fingerprint guard.** `AgentPromptOffer.fingerprint` is an FNV-1a digest of
question + command + every option's key and label. `answerAgentPrompt` re-reads
the pane and compares before writing anything. Option *numbers* are positions,
not decisions: between a toast being drawn and its button being clicked the
agent may have redrawn, timed out, or been answered in the pane, and "1" would
then answer a question nobody showed the user. A refused click costs a trip to
the terminal; an unchecked one is a silent wrong answer. The digest is over
parsed content, not raw rows, so a cosmetic repaint does not invalidate it.

**`AgentPromptOption.submit` decides the trailing Enter.** False for the
numbered lists a TUI draws — they act on the keypress, and an Enter behind one
lands in the composer that replaces the prompt, submitting whatever the user had
half-typed. True only for the bare `[y/n]` of a line-oriented `read`, which does
nothing until Enter. Do not make this unconditional in either direction.

## Lifecycle

`useActivityTicker` calls `dismissSettledPrompts(next)` each 1.5s tick, before
edge detection: a pane that stops asking loses its sticky toast, so a card never
offers buttons for a question already answered in the terminal. A refused click
raises `notifyPromptUnanswered` (`stale` or `gone`), never escalated to the OS —
the user is at the keyboard by definition, having just pressed the button.

The notification centre deliberately shows no answer buttons: a history row is
stale by definition.

## Checks

`npm --prefix desktop-tauri run verify`. The parser rules are covered by
`tests/agentPrompt.test.mjs` against the verbatim Codex block; the toast's two
themes were proven by rendering the real stylesheets headlessly rather than by
eye.
