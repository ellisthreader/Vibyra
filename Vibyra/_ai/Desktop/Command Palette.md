# Command Palette

Scope: the Ctrl K palette's second build — scopes, fuzzy ranking, and the
agent-facing rows that made it worth opening. Shipped 2026-08-25.

## What Was Wrong

The palette shipped with the titlebar's `CommandBar` (see `Desktop/Project
Stage And Titlebar.md`) as a way in, and then had almost nothing behind it.
Twenty-odd rows, all navigation: attention panes, projects, sessions, and seven
actions. It could take you *to* a terminal but never act *on* one, and the
seven verbs it did offer were the ones the chrome already had buttons for.
Search was `label.includes(query)` — no ranking, no keywords, so "kill" found
nothing and typing scrolled the selection off screen because nothing scrolled
it back.

## The Shape Now

Four scopes, each with a one-character prefix, advertised on a clickable rail
in the footer because nobody guesses a prefix:

| Prefix | Scope | What it keeps |
| --- | --- | --- |
| _(none)_ | everything | curated order, grouped |
| `>` | commands | `kind: "command"` |
| `@` | sessions | `kind: "session" \| "attention"` |
| `#` | projects | `kind: "project"` |
| `!` | ask | nothing — rows are **built from the message** |

Entry sources are one file each under `components/layout/`, all returning
`CommandPaletteEntry[]` and all reading stores through `getState()`:

- `paletteAttentionEntries` — blocked panes, and where a prompt parses,
  **Approve / Always allow / Decline rows that answer it from the palette**.
- `paletteSessionEntries` — every session in the project, plus Restart, Zoom,
  Hibernate/Wake and Close for the focused one.
- `paletteLaunchEntries` — one row per installed agent, the picker, projects.
- `paletteViewEntries` — stage layouts, side-panel tabs, all nine settings
  sections.
- `paletteToolEntries` — dictation, screenshot, notifications, updates, report.

## Load-Bearing Decisions

- **The base list is snapshotted once per opening, not per keystroke.**
  `attentionEntries` calls `scanAgentPrompt`, which walks an xterm buffer.
  Rebuilding on every character would make typing in the palette feel like
  typing in the terminal. `CommandPalette` holds it in `useState` and only
  re-ranks on query change.
- **Answering only works for the project on screen.** A pane in another project
  has no live xterm instance, so `scanAgentPrompt` returns null and the row
  degrades to "Open …". `answerAgentPrompt` still re-reads and compares the
  fingerprint; a refused answer falls back to focusing the pane rather than
  silently doing nothing.
- **`!` never scores its own rows.** Ask entries are built from the message, so
  ranking "run the tests" against "Send to Claude Code" would delete every row
  whose target the user did not happen to name. `rankPaletteEntries` returns
  the ask pool untouched.
- **Grouped when idle, ranked when typing.** Group headings on a scored list
  cut the ranking into islands that each start over; the unfiltered list keeps
  its curated order because that order is the most useful thing on screen.
- **Recency is a tiebreaker, capped at 30.** A whole-phrase hit scores 1000+
  with a 400 word-boundary bonus, so habit can decide between two equal
  matches and can never overturn what was typed. `paletteRecents.ts`, twelve
  ids, localStorage.
- **`launchConfigured`, never `spawnAgent`.** Model, effort, permission mode,
  account and the safe-workspace preflight live in the project's launch
  contract; a palette launch that bypassed it would quietly differ from the
  same launch started from the rail.
- **No "close all".** It was written, then cut: one Enter away from ending
  every process in a project is a support ticket. Single-pane Close stays,
  matching the pane header's own ✕, which has never confirmed either.

## Files

Pure, tested: `lib/paletteQuery.ts` (scope parsing, fuzzy scoring, highlight
ranges), `lib/paletteRanking.ts` (scope filter + score + sort, ask injected as
a callback so it stays pure), `lib/paletteRecents.ts`, `lib/paletteTypes.ts`.

Wiring: `components/layout/commandPaletteEntries.ts` is 33 lines — it composes
the five sources and hands `askEntries` to the ranker.

Components: `CommandPalette.tsx` (state + keys), `CommandPaletteRow.tsx`
(mark, highlight, detail line), `CommandPaletteFooter.tsx` (scope rail).

Styles: `palette.css` owns the shell, `palette-rows.css` owns the rows — split
to stay under the 200-line gate, and pinned together by
`tests/paletteStyles.test.mjs`, which fails if either half names a class the
other does not. `.pal__detail--code` is the only mono detail: a command or a
path. Prose in mono reads as output the app is quoting.

## Traps

- `lib/paletteRanking.ts` imports its siblings with explicit `.ts` extensions.
  Node's ESM loader under `--experimental-strip-types` needs them; without,
  the test dies with `ERR_MODULE_NOT_FOUND` and no line number.
- `CommandBar` subscribes to pane activity again, but through a selector that
  returns a *number*. The titlebar rebuild deliberately dropped that
  subscription; a count only re-renders when the count changes, which is the
  version that is safe.
