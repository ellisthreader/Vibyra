# Vibyra changelog

Newest first. Versions are the desktop app's; `docs/desktop-updates.md`
describes how a release reaches an installed copy.

## 0.3.5 — 29 August 2026

Two large additions, and the first is a second thing Vibyra can be.

### Agent Mode

Vibyra now has three modes — **Agent**, **Code** and **Chat** — switched from
the titlebar. Code Mode is unchanged and is never unmounted when you leave it:
its terminals keep their processes, their renderers and their scrollback.

**Persistent teammates.** An agent is a named colleague with a brief you write,
its own durable memory, its own skills, and its own granted folders. It keeps
all of that across every conversation you have with it. Creating one asks three
questions — name, what it is for, which engine — and everything else has a
default you can change afterwards.

**Many chats per teammate.** One agent owns as many conversations as you like.
Starting a new one touches nothing else and costs nothing: all of them share
the same brief, memory, skills and grants. Chats can be renamed, pinned,
searched, archived and deleted, and search reads what was actually said rather
than only titles.

**Real structured chats, not a scraped terminal.** Turns run as short-lived
provider processes read as JSON, so the transcript is a typed event log rather
than screen output parsed back. Assistant text streams as it arrives; tool
calls show as one block that pairs the command with its output; file changes
collapse into a list; a failure shows the provider's own words.

Both adapters were built against the CLIs rather than their documentation.
Two findings shaped them:

- `codex exec resume` rejects `-s`, `-C` and `--add-dir` — passing any of them
  exits 2 having done nothing — so the sandbox travels as a config override.
- `claude --resume` keeps the id it was given, which is what lets one chat stay
  one conversation for its whole life.

Vibyra probes each CLI's version and help at startup and offers only the
controls that build actually has. A CLI too old for structured chat says so,
in a sentence with something to do about it, and its terminals keep working.

**Where an agent may work.** Every agent gets a private folder of its own and
nothing else. Folders you grant are canonicalised when granted *and* re-checked
at the moment of use, so a symlink swapped in afterwards escapes nothing, and a
folder whose name merely starts the same is not inside anything. Revoking takes
effect on the next turn.

**Decisions.** One place decides what needs asking. Reading inside a folder you
granted never asks. A class of local write can be trusted away. Publishing,
spending, deleting outside a granted folder, merging and anything touching a
credential always ask, every time, and can never be trusted away — because the
next one is not the one you were shown. What you approved is stored, and it is
the stored row that runs; if the action changes after the card is raised, the
card is invalidated and nothing happens.

**Memory you can correct.** Each agent keeps short durable statements with the
chat and turn they came from. Reflection is off, suggest, or automatic; on
automatic only plain facts commit themselves, and anything that reads as a rule
— or contradicts something already known — still waits for you. The memory
budget shapes the prompt, never the store: what does not fit stays searchable
and correctable, and pinned entries are always included.

Nothing credential-shaped is ever stored, by any route, including you typing
it. The same refusal covers skills.

**Skills.** A procedure taught once and reused, with a narrow trigger, the
steps, how to know it worked, and where to stop and ask. Versioned, so an edit
that turns out wrong is a rollback rather than a loss. An agent may *propose* a
skill after repeating the same work; only you can install one, because a skill
is a standing instruction injected into every matching turn.

**Routines.** Scheduled work — daily, on chosen days, or on an interval — that
opens a fresh chat each time it runs. The rule is stored and the next instant
recomputed through a real timezone database, so 09:00 stays 09:00 across the
two days a year the clocks move; a time that does not exist runs at the first
one that does, and one that happens twice runs once. Routines run while Vibyra
is open, and a run missed because the app was closed is recorded as skipped
rather than fired in a burst when you come back. They default to plan-only.

**Handing work between teammates.** An agent can pass work to one you have
allowed it to write to. A handoff can never widen the recipient — that turn is
built from the recipient's own brief, folders and access level — and one asking
to publish, spend or delete becomes a decision for you instead of a turn that
runs. Hop limits, chain limits, duplicate detection, a cooldown and an app-wide
pause keep two agents from talking to each other indefinitely. Every attempt is
in both agents' trail, including refusals, with the reason.

**Chat Mode.** A conversation with no teammate and no project: no brief, no
memory, no folder. Attachments are copied into the chat's own folder, so adding
a screenshot does not quietly hand over the folder it came from. You can mount
one folder explicitly, and the composer stops claiming to be detached the
moment you do.

### Review dock and the worktree fleet

The review dock is consolidated: approve and reject rather than land and drop,
plain-language fleet status, and GitHub actions gated on actually being
connected. Safe-mode worktrees gain a collision radar and disk-usage reporting.

### Under the hood

- Agent Mode has its own per-account SQLite store with write-ahead logging,
  foreign keys, transactional migrations and a copy taken before any upgrade.
  Terminal sessions keep their own file and are untouched.
- Cancelling a turn signals the whole process group, so stopping one does not
  leave the compiler it started running.
- Signing out closes the agent database and stops every structured turn, the
  same way it already killed every terminal.
- Agent Mode loads as its own bundle, so it costs nothing until you open it.

Verified before release: 562 frontend tests, 271 core tests, 204 app tests,
clippy clean, no first-party source file over 200 lines, and an opt-in live
journey against both signed-in CLIs — two turns each, an exact resume, and the
first turn still remembered.

## 0.3.0 and earlier

Release notes for 0.3.0 and before were kept in the app's What's New panel and
on the Vibyra site rather than in this file, which starts here.
