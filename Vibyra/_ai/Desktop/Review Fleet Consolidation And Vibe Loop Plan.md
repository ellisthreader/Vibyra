# Review Fleet Consolidation And Vibe Loop Plan

Scope: landing the parallel-review fleet that already exists, closing the
2026-08-29 audit on it, and then the three features that turn the Review dock
from a diff reader into a vibe-coder loop: try the change running, read it in
plain language, undo a land. Ends with the UI design spec for all of it.

Related: [[Parallel Review And Worktree Fleet Plan]] (the fleet build record),
[[Safe Workspace Review And GitHub]] (the shipped contract + audit),
[[Project Dock]], [[AI Terminals]].

## Where things stand (2026-08-29)

Three states of this feature exist and none knows about the others:

1. **Shipped 0.2.8** — the single-pane Review dock (`ReviewPanel` + four
   siblings, 434 Node tests).
2. **The fleet build** — uncommitted in worktree `vibyra-1a04a6263f0-1`
   (branch `vibyra/vibyra-1a04a6263f0-1`). Phases 0–6 of the fleet plan:
   fleet level, collision radar, three-way merge through a scratch index,
   partial land, conflict routes, virtualised diff, Settings ▸ Safe
   workspaces, PR state. 549 Node tests, all gates green. **Never run.**
3. **The audit** — `Safe Workspace Review And GitHub.md` in worktree
   `vibyra-1a04dcc956d-4`, run against state 1, six findings. One (the
   `-- .` subfolder scope) is already fixed by the fleet build; five still
   apply to it.

## Phase A — Consolidate and verify

The revolution is built; it is invisible. Nothing else in this plan starts
until A ships.

1. **Land the fleet worktree** into the release line via the Review dock
   itself (dogfood the merge), or a clean branch off the newest release
   branch per [[release-branch-topology]].
2. **Close the five live audit findings on it:**
   - GitHub readiness must validate the `origin` host (github.com over ssh or
     https), not just non-emptiness — a GitLab remote currently arms a PR
     button that pushes and then dies at `gh pr create`.
   - The merge patch sibling `<worktree>.vibyra-merge.patch` becomes a
     collision-safe temp file (same treatment `snapshot-merge-*.index` got).
   - `ReviewPrSheet`: backdrop click and Escape must not dismiss while
     `busy` — the commit/push/PR keeps running invisibly.
   - `reviewStore.github` gets keyed by project root (or a stale-response
     guard) so fast project switching cannot show the wrong readiness.
   - Merge binds the worktree to the same repository before applying;
     a `vibyra/*` branch-name prefix alone is not ownership proof.
3. **Run the manual validation matrix** from the fleet plan — the step both
   docs flag as never done: six live agents; dock-grip drag refits xterm once
   on release; keyboard-only land; a 20k-line diff; two agents steered into
   the same file to watch the radar row appear live.
4. **Merge the two vault notes**: `Safe Workspace Review And GitHub.md`
   becomes the canonical contract doc with the fleet as-built folded in;
   the audit section shrinks to whatever survives A2.

## Phase B — Try this version (review by running it)

The vibe-coder move: judge the change by looking at the running app, not the
diff. The dock already holds Preview, mounted-once, in the same shell.

- A `Try` action on ready fleet rows and in the changeset action bar points
  the Preview tool at **that worktree's** app instead of the project's.
- One worktree preview at a time. Trying another workspace swaps the target;
  the row being previewed wears an accent-soft `Previewing` pill; the Preview
  tool's header names the branch so there is never doubt about which version
  is on screen.
- Constraints that must survive: the preview stays mounted-once (switching
  targets must not strand dev servers — stop the old worktree server before
  starting the new one); the dock reserve rule is untouched; `Try` never
  writes to the user's checkout.
- Exit: `Back to project` restores the normal preview target. Landing or
  discarding a previewed workspace restores it automatically.

## Phase C — Plain-language changeset brief

A vibe coder reads intent, not hunks. Above the file list, on demand:

> **What changed** — three sentences: what this changeset does, what to
> check, and a risk read. Plus the file count it is based on and when it was
> taken (design rule: every count is live or labelled stale).

Two candidate mechanisms, decide at build time:

1. **Headless one-shot**: pipe the bounded diff into `claude -p` (or the
   pane's own CLI in print mode) and render stdout. Clean capture, no PTY
   involvement, cost visible to the user as a single button press.
2. **Ask the author**: `reviewHandback.ts` already composes text into the
   pane's PTY via the sanctioned `writeTerminal` + `notePromptInput` path.
   Reversing it (agent → dock) needs an output capture contract that does
   not exist; only choose this if one appears for other reasons.

Route 1 is the plan. The brief is generated only on click — never
automatically, never billed silently. No `--ask` violet on the card: `ask`
is reserved for the decision tier; the brief is information, it renders in
the neutral row language with an uppercase label.

## Phase D — Undo a land

At merge time the exact applied patch already exists. Keep it.

- Store the last N (10) landed patches per project under the app config dir,
  named by branch + timestamp, with the repo head they applied onto.
- The post-land outcome line gains `Undo` — reverse-apply with the same
  `--check`-first, scratch-index, all-or-nothing contract. If the project
  moved since the land, say which files block, exactly like a forward merge.
- Undo is available until the user commits (the patch landed as unstaged
  edits; after a commit the honest answer is "this is git's job now" — the
  button says so rather than pretending).
- This is what makes `Land all that apply cleanly` a button people dare
  press.

## UI design spec

Interactive mockup (approved before build): the **Review Dock Redesign**
artifact — <https://claude.ai/code/artifact/5cd41912-76d3-4053-b9cf-d85295f4c487>
— Fleet and Changeset levels with Try, the brief, and undo, built
on the real `tokens.css` values. Design rules carried over from the fleet
plan, unchanged: two levels never three; one saturated element per surface;
every count live or labelled; destructive never at constructive weight; the
reserve rule; type and colour from tokens only.

**Vocabulary and colour (Ellis's calls, 2026-08-29): the panel must be
understood instantly, with zero git words on the surface.**

- Three verbs, three colours, everywhere: **Approve** (green — puts the work
  into the project), **Preview** (blue/accent — look at it running first),
  **Reject** (red — throw the agent's copy away). Tinted soft buttons on
  cards; one solid green for the main approve so the eye lands there first.
- The fleet is a list of **cards named by the pane's chat title** ("Login
  retry flow"), never the branch. Statuses are sentences: "Ready to
  review", "Still working…", "Nothing changed yet", "Terminal closed — its
  work is saved here" (orphan).
- The fleet header's count line and the refresh/⋯ header icons are
  **removed** (refresh becomes the live watcher's job; housekeeping stays in
  Settings). The radar keeps its UI but is worded as a heads-up sentence:
  "Two agents are editing the same file".
- The brief's button is **"Explain it to me"**; file marks are `new`/`edit`
  chips, not A/M; checkbox actions are "Keep all / Keep none"; the PR
  action is **"Share on GitHub"**; approve outcome offers **Undo** with
  "back to exactly how it was" copy; every destructive step keeps an inline
  "Yes, …" confirm.
- `ready` state colour moves from accent to **green** (dot, tab badge, and
  Approve agree: green = ready for a yes); `working` moves to accent-blue
  pulse. This supersedes the fleet plan's `.adot--ready` accent decision.

New-element decisions the mockup encodes:

- **`Try` is a quiet ghost button** beside `Land` on ready rows and in the
  changeset action bar — constructive but secondary, never primary weight.
- **`Previewing` is an accent-soft pill** on the row, mirrored by the branch
  name in the Preview tool's header. Two surfaces, one truth.
- **The brief is a tinted sub-panel** (`--surface-tint`, hairline border,
  uppercase label) at the top of the changeset — the same idiom as the file
  list, no new colour. Until generated it is one quiet `Summarize` action.
- **Undo lives in the outcome line**, text-button weight, with the same
  inline-confirm idiom every other destructive action in the dock uses.

## Validation

| Area | Proof |
|---|---|
| Audit fixes | Rust/Node test per finding (host parse, temp patch, keyed github, busy-modal, repo binding) |
| Try it | Manual: try → land → preview restored; try A then B → one dev server alive |
| Brief | Node test over the compose; manual one-shot against a real diff |
| Undo | Rust test: land, project moves, undo reports blockers and touches nothing; land+undo round-trips to byte-identical tree |
| The matrix | The fleet plan's manual rows, run for real, results recorded here |

Gate per phase: `npm --prefix desktop-tauri run lines`, `typecheck`, `test`,
`build`, `cargo test` in `src-tauri` — verified in a clean worktree, never
the working tree ([[release-pipeline-blockers]]).

## Non-goals

Unchanged from the fleet plan: no merge editor, no git client, no cloud
state, no automatic landing. Additionally: no automatic brief generation, no
CI watching, no PR-comment iteration, no multi-worktree preview grid.
Phase 7 launch coordination stays research.
