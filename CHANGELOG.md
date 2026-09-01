# Vibyra changelog

Newest first. Versions are the desktop app's; `docs/desktop-updates.md`
describes how a release reaches an installed copy.

## 0.4.0 — 31 August 2026

A reconciliation and a new way to use Vibyra.

### The 0.3.0 work is back

0.3.5 was branched from 0.2.8, and 0.2.9 and 0.3.0 were never merged into it.
Three finished features were missing from the build you have been running, and
all three return here.

**Startup shows a splash again** instead of a blank rectangle, and the
workspace window opens only once it has something to draw.

**Project activity returns.** Right-click a project — or press Shift+F10 — for
seven days of Git activity, a clearer name, and a colour. Closing a project
still takes two deliberate steps.

**The auth backdrop is a WebM again**, 750 kB rather than 2.7 MB, and it mounts
only on signup. The startup chunk drops back from around 948 kB to 560 kB.

Where the two lines had both changed the same thing, the newer review fleet
wins. One casualty is named honestly: 0.3.0's per-file **Reject selected** is
gone, because the fleet reviews per agent and the old button had no home in it.
Rejecting a whole agent's work is unaffected.

One security fix falls out of the merge. The 0.3.5 rewrite of the GitHub probe
had lost the scrub that removes `GH_TOKEN` and friends before running `gh`, so
an automation token in your environment could have been preferred over your own
account. The scrub is back.

### Ask Vibyra

The dock's Chat panel is now **Ask** — an assistant that can actually see your
workspace, and the Memory panel is retired.

Ask is briefed on live state: every pane's status, what it is doing, its
branch, its exit code, renderer and app CPU, memory, what you have spent today
and this month, your settings, and matching notes from a connected Obsidian
vault. It reads terminal output from at most two panes — the one waiting on you
and the one that just died — because four healthy panes are already described
by their summary lines.

**Ask advises; the app acts.** The buttons under an answer are computed from
your workspace, never chosen by the model. The briefing contains output your
own agents wrote, and this is what makes that safe to send.

**Credentials never leave the machine.** API keys, tokens, JWTs, PEM blocks,
`Authorization:` headers and passwords inside URLs are stripped before the
briefing is sent, and the panel tells you how many were removed. Commit SHAs,
stack traces and test output are deliberately left alone.

### Talking to it

Ask listens and answers out loud. Press the microphone in the composer, speak,
and the reply is read back to you. Mute it from the panel header, or replay any
past answer.

One ring shows who is talking — **cobalt while you speak, violet while Vibyra
does** — and both are real readings, not decoration: your microphone level, and
the frequency of the audio actually leaving the speakers. Speaking over Ask
interrupts it, the way a conversation should. Spoken replies are billed to your
own OpenAI key and appear in Settings with everything else.

F8 dictation into a terminal is unchanged.

### Agent Mode is readable

The runtime under Agent Mode was finished; the surface reading it was a
plain-text log. It now renders.

**Answers are rendered**, not printed. Headings, lists, bold, inline code and
fenced blocks arrive as themselves rather than as the characters the model
typed, and a code block has a copy button. An unterminated fence is still
treated as a fence, so a block does not snap from prose to code when the model
finishes typing it.

**A turn says what it cost.** Tokens and cost were being computed and thrown
away; they now close every turn, alongside Copy, Retry and Edit & resend. Retry
appends rather than replacing — branching a transcript is a real feature and an
append dressed up as one is worse than not having it.

**Files a teammate changed open into a diff**, through the same windowed,
word-level renderer the review dock uses. What it shows is the file's
uncommitted state rather than a replay of the edit, and the heading says so.
The diff is fetched when a row is opened, and only for paths inside that
agent's own grants.

**Tool calls read as verb, target, outcome** — what it did, to what, and how
that went, with the time it took — so a run of six is scanned rather than
opened one by one.

**Attachments belong to the chat.** They were held in the view that added them,
so they vanished on the first chat switch while the files stayed in the folder
and stayed on every following turn.

Agent Mode also gets a keyboard: mode switching, new chat, focus composer, step
between chats, stop the running turn, and palette entries for every teammate,
panel and chat. Every binding is refused while Code Mode has the window, so a
terminal keeps every key it is sent.

### Unattended work reports itself

The scheduler has been announcing every routine run since Agent Mode shipped
and nothing was listening. One subscription now holds that listener, mounted
above every mode so it survives being in Code Mode.

**Routines show their work.** The last dozen outcomes as marks — amber for a
run skipped because Vibyra was closed, red for a real failure with its reason
in words, cobalt for one happening now — the agent's mark before the name, and
the last run as a way into the chat it created. Run now runs one immediately
without disturbing its schedule.

**Skills leave evidence.** A skill is a standing instruction injected into
every matching turn, and until now there was no way to tell one had fired. The
skills that shaped an answer are named above it at the version that ran, each
one a link to the procedure.

**A decision finds you where you are.** A waiting decision and a failed routine
now raise a notice from anywhere, and the Agent button carries a count. A
routine that simply worked raises nothing: a toast every morning at 09:00 is
how a person learns to ignore toasts.

### Switching modes no longer drags

Leaving Code Mode hid the terminals with CSS but never told the native side
they were off screen, so every pane kept streaming at its on-screen rate into
canvases nobody could see — up to sixty deliveries a second, for as long as you
stayed away. That is what made switching feel slow, and it is also where the
graphics-context loss that drops every terminal to the slower renderer lives.

### Fixes

- **Switching projects no longer stalls.** A suspended pane was rebuilding a
  full terminal and re-parsing its whole scrollback on every switch — about
  250 kB a pane. It now draws a bounded tail. Restoring a terminal is
  untouched: it replays from the saved snapshot, not from the preview.
- **A click above the prompt types again.** Pressing the empty space over a
  bottom-anchored prompt left focus on the pane instead of the terminal, so the
  keyboard did nothing until you clicked directly on the text.

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
