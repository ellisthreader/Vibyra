# Agent Mode — as built

Shipped in 0.3.5, 29 August 2026. The plan it was built from is
`Agent Mode Reconstruction Plan.md`; this records what the code actually does
and, where the two differ, why.

## The shape

Three modes in the titlebar: Agent, Code, Chat. Code Mode is **hidden, never
unmounted** — `.shell__mode` uses `display: contents` and the `hidden`
attribute, because its panes carry live PTYs with xterm renderers and
scrollback that a remount would destroy.

Two execution paths, deliberately not one:

| | Code Mode | Agent/Chat Mode |
|---|---|---|
| process | long-lived PTY | short-lived, one per turn |
| value | the screen | stdout, read as JSON lines |
| owner | `vibyra_core::pty` | `vibyra_core::agent_runtime` |

They share only the environment sanitiser. Rendering a terminal and scraping it
back into a transcript would be the same work done twice and wrong once.

## Verified provider contracts

Captured 2026-08-29 from **codex-cli 0.150.1** and **claude 2.1.251**. The
fixtures in `agent_runtime/codex_tests.rs` and `claude_tests.rs` are verbatim,
so a renamed field fails a test rather than a chat.

**Codex** — `codex exec --json` emits `thread.started` (carrying `thread_id`),
`turn.started`, `item.started|updated|completed` around items typed
`agent_message`, `reasoning`, `command_execution`, `file_change`,
`mcp_tool_call`, `web_search`, `todo_list`, then `turn.completed` with usage.

The trap: **`codex exec resume` rejects `-s`, `-C` and `--add-dir`.** They are
flags of `exec`, not of the subcommand, and passing one exits 2 having done
nothing — every resumed turn in the app would die. The sandbox travels as
`-c sandbox_mode="…"` instead, which was verified to take effect. `--last` is
never used: a chat names its exact thread or starts a new one.

**Claude** — `-p --output-format stream-json --verbose` (the `--verbose` is
mandatory) emits `system`/`init` with the session id, `assistant` messages
whose `content` array can hold thinking, text and several tool calls at once,
`user` messages carrying `tool_result` blocks, and a final `result` with usage
and `total_cost_usd`.

`--session-id` pins the conversation before the process starts; `--resume`
continues it and **keeps the same id** (only `--fork-session` changes it).
Checked both ways.

The asymmetry that shapes everything above the adapters: Claude's id is known
before the first turn runs, Codex's arrives *during* it. So a chat may have no
session id yet, and the runtime binds one when `session.identified` appears.

Neither `--dangerously-skip-permissions` nor
`--dangerously-bypass-approvals-and-sandbox` is reachable. Full access maps to
`acceptEdits` / `danger-full-access` — a sandbox level, not the removal of the
approval layer.

## Where things live

Core (`vibyra-core`) owns every rule: `agentdb` (SQLite, WAL, transactional
migrations, pre-upgrade backup), `agent_profiles` (roster + path authority),
`agent_chats` (chats, transcript, attachments), `agent_runtime` (adapters,
supervisor, capability probe), `agent_context` (the deterministic preamble),
`agent_memory`, `skills`, `routines`, `agent_mail`, `approvals`.

The shell crate owns only what needs a running app: `agent_mode::hub` (one
account's world at a time), `turns`, `prepare`, `scheduler`, `probe`, and thin
Tauri commands.

The database is **per account**, under `agent-mode/<scope>/`, with the agent
homes and chat attachment folders beside it. `account` is also a column, as
defence in depth. Sign-out closes the world and signals every turn.

## The rules worth remembering

**Paths.** Canonicalised at grant time *and* again at every check, so a symlink
swapped in afterwards escapes nothing. Comparison is component-wise, so
`/home/ana-old` is not inside `/home/ana`. A file that does not exist yet is
judged by its nearest existing ancestor.

**Approvals.** Reads inside a grant never ask. Local writes may be trusted away
for a class. Publish, spend, destructive and secret always ask and can never be
trusted away, because the next one is not the one the user saw. The approved
row is stored and it is the stored row that executes — the card is the
contract. SHA-256 fingerprint over every field that could change the effect,
length-prefixed so adjacent fields cannot be slid into each other. A cancelled
turn invalidates its pending cards.

**Memory.** Budget shapes the prompt, never the store. Pinned entries always
inject. Automatic reflection commits only facts and lessons; constraints,
decisions and preferences are rules the agent would keep acting on and always
wait. Nothing credential-shaped is stored by any route — same filter guards
skills, which are injected into every matching turn.

**Routines.** Civil-time rules resolved through chrono-tz on every tick, so
09:00 survives DST. Nonexistent local times step forward; ambiguous ones take
the earlier. Missed runs are *skipped and recorded*, never caught up. Default
permission is Plan. `next_run_ms` is advanced **before** the run, so a slow
turn is not still due at the next tick.

**Mail.** A handoff cannot widen its recipient — that turn is assembled from
the recipient's own profile — so the guards are about cost and loops, not
authority. Hop cap 3, chain cap 8, duplicate window 10 min, 5 s cooldown,
per-agent allowlist separate from `mail_enabled`, app-wide pause. Refusals are
stored with their reason.

## Deliberate departures from the plan

- **Plugin gateway**: the manifest/connection/grant tables exist in the schema
  and the approval broker already classifies every risk a connector would
  raise, but no connector ships. Shipping unverified OAuth against live
  accounts was the wrong trade for a first release; the plan's own rule —
  catalogue entries that are not implemented cannot connect — is honoured by
  there being none.
- **Reflection** draws candidates from what the agent already said (a
  `REMEMBER:` line, optionally classed) rather than making a second model call
  per turn. An extra round trip per turn to usually produce nothing doubles the
  cost of every conversation.
- **`assistant.delta`** is streamed and never stored; the completion carries
  the same text in one row. Deltas also bypass Zustand entirely, batched per
  animation frame outside React — the same contract `terminalBus` uses, and for
  the same reason.

## Gotchas found the hard way

- `fsx::harden` is a **file** hardener (0600). Applying it to a directory
  strips the execute bit and makes everything inside unreachable — including an
  open SQLite database. `harden_dir` (0700) exists for that.
- A fresh database has a non-zero length before any migration runs, because
  `journal_mode` writes a header. The pre-upgrade backup keys on the *version*
  being ≥ 1, not on the file being non-empty.
- Node's strip-types loader needs the `.ts` extension on value imports between
  `src/lib` modules; Vite does not. Follow the existing files.

## Verification

`npm run verify` covers all of it. The live journey —
`crates/vibyra-core/tests/live_engines.rs`, gated on
`VIBYRA_LIVE_ENGINE_TESTS=1` — runs two real turns per engine against a
signed-in CLI and asserts the second resumed the first's conversation and still
remembers it. It passed for both engines before 0.3.5 was tagged.
