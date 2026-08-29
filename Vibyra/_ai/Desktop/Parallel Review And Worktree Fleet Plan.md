# Parallel Review And Worktree Fleet Plan

Scope: the right-hand dock, the Review tool inside it, and the safe-mode
worktree machinery that lets many terminals work the same repository at once
without overlapping. Covers the review of what exists today, the design
direction, and a phased build.

Related: [[Project Dock]], [[AI Terminals]], [[Desktop Shell]],
[[Vibyra Marketing Website Master Plan]].

## Goal

Make parallel agent work the thing Vibyra is *obviously* best at, and make the
Review tool the surface that proves it.

Today the isolation is real but silent: each safe-mode terminal gets its own
git worktree and branch, and nothing ever collides. That is table stakes —
`git worktree` does it, Conductor does it, Crystal does it. What nobody does
well is the part *after* isolation: telling you which agents are done, which
two agents are about to fight over the same file, and landing six changesets
into one working tree without the last three failing.

That gap is the product. This plan closes it.

## Current-State Audit

### What already works, and works well

- **Isolation is genuinely safe.** `prepare_safe_workspace` snapshots a dirty
  working tree into a real commit through a scratch `GIT_INDEX_FILE`, so the
  user's branch, index and working directory are never touched. The snapshot
  commit becomes `base_commit`, which means review diffs against *what the
  user actually had*, uncommitted work included — not bare `HEAD`. The test
  in `workspace.rs` pins exactly this.
- **The ownership guard is correct.** `review::vibyra_branch` refuses any
  branch that does not start with `vibyra/`, so a stray path handed to
  `review_merge` or `review_discard` cannot delete real work. `create_pr`
  reuses the same guard rather than trusting a caller-supplied branch.
- **Merge is all-or-nothing and honest.** `git apply --check` runs before
  `git apply`, so a blocked patch reports the files in the way and changes
  nothing.
- **The dock's geometry is right.** `dockReserve` commits on pointer release
  rather than per drag frame, so dragging the dock refits no xterm until the
  drag ends. That decision is load-bearing and must survive everything below.
- **The launch approval is well-written.** "Your current work stays exactly
  where it is" is the correct sentence, and re-taking the fingerprint at click
  time rather than at dialog time is the right call.
- **Bounded payloads everywhere.** 2,000 files, 512 KiB per diff, 1 MiB per
  untracked line count, and truncation is always *said*, never silent.

Do not regress any of the above.

### The eleven problems

**P1 — Review is single-pane in a multi-pane product.**
`ReviewPanel` resolves exactly one pane and renders its changeset.
`reviewablePanes` returns the whole list but only uses it to build a chip row.
With six agents running you cannot see, in one glance, who has changes, how
many, or who finished. The chip row does not show counts, status, or
staleness — the chips are just names.

**P2 — There is no collision awareness at all.**
The single most valuable computation in this domain is not being done:
intersecting the changed-file sets of the live worktrees. Every ingredient is
already in memory — `reviewStore.statusByPane[id].changed[].path`. Nothing
computes it. The result is that two agents editing `dockLayout.ts` is
discovered at merge time, by the *second* merge failing, with the reason
buried in `git apply --check` stderr.

**P3 — A conflict is a dead end.**
`ReviewActions` renders "Not merged — your project has its own changes in: X.
Nothing was touched." and then offers nothing. No resolve, no partial land, no
"rebase this worktree onto what the project now has", no way to hand the
conflict back to the agent that is still sitting right there in a terminal.
For a product built on parallel agents, the exact moment the value breaks is
unhandled.

**P4 — `git apply` is used without `--3way`, and it should not be.**
`merge::apply` calls plain `git apply`. The base commit is a real object in
the repository, so `--3way` is available and would auto-resolve most cases
where the project moved on in a *different* region of the same file. Plain
`apply` fails on context drift that a three-way merge handles trivially. This
is the single highest-leverage backend change in the plan.

**P5 — Merge is whole-worktree only.**
`merge_back` diffs `base..worktree` across everything and applies it as one
patch. You cannot take three files and leave two. An agent that nails the
feature *and* reformats twelve unrelated files gives you an all-or-nothing
choice, which in practice means Discard and start over.

**P6 — Status is pull-only, so the panel is always stale.**
`reviewStore.refresh` fires on mount and on pane change. The comment defends
this ("a review is a deliberate reading moment"), which was right for one
pane. With six, the dock never tells you anything became ready. Meanwhile
`activityFor()` already knows when a pane goes `working → idle`, and
`onFsChanged` already watches the tree. The "ready to review" signal is
computable today and is simply not wired.

**P7 — Worktrees leak, and nothing manages them.**
There is no `git worktree prune`, no `worktree list`, no reaper, and no
management surface anywhere in the app. Every one of these strands a worktree
and a branch on disk permanently:
- closing a pane with the X instead of Discard,
- the app being killed or crashing,
- `reviewStore.discard` failing *after* `close(pane.id)` succeeded — the pane
  is gone and the worktree is unreachable from the UI,
- a `*.vibyra-merge.patch` left behind if the process dies mid-merge.
Weeks of daily use turns into gigabytes under `terminal-worktrees/` and a
`git branch` listing that is mostly `vibyra/*`.

**P8 — Review is invisible until you go looking for it.**
The only signals are a `Review` chip inside a pane header and a static tab
label in `DockTabs`. No count, no badge, no notification. Nothing on the
titlebar. You have to already know to look.

**P9 — The diff reader is a placeholder.**
`ReviewDiffView` splits on newlines and colours by first character. Beyond 400
lines it offers "show all", which then renders every line as a `<span>` into a
`<pre>` with no virtualisation — a 512 KiB diff is tens of thousands of
elements. There is no syntax highlighting, no word-level intra-line diff, no
collapsed-context, no side-by-side, no in-diff search, and no keyboard
navigation of any kind.

**P10 — GitHub is a one-shot exit, not a lane.**
`ReviewPrSheet` creates the PR, prints the URL, and the PR leaves the app
forever. No checks status, no review state, no "this merged upstream so the
worktree can go". `githubCreatePr` hardcodes `base: null` even though
`create_pr` accepts `Option<&str>` — so a PR always targets the default
branch, even when the user launched from a feature branch.

**P11 — Parallel launch has zero coordination.**
`runLaunch` opens N identical terminals with the same model and no scoping.
Nothing tells agent 2 what agent 1 is touching. Isolation is purely
mechanical. Coordination is the differentiator and there is none.

### Correctness findings to fix on the way through

1. **Subfolder projects silently lose work.** `worktree_status` and
   `merge_back` both scope with `-- .`, relative to `safe.cwd`, which is
   `worktree/<project-relative-path>`, not the repo root. In a monorepo where
   the project is a subfolder, anything the agent changes outside that
   subfolder is invisible to review *and* is dropped by merge. Status and
   merge agree with each other, so it is coherent — but it is silent, and
   silent loss is the one thing this module otherwise never does.
2. **`untracked_files` reads before it truncates.** Every untracked file up to
   1 MiB is read to count lines, for the whole list, *before*
   `changed.truncate(MAX_FILES)`. A worktree with a large untracked tree
   blocks the command thread. `map_parallel` is in the crate and unused here.
3. **`conflict_paths` breaks on Windows paths.** It splits each stderr line on
   `:` and takes field 0, which turns `C:\src\foo.rs` into `C`. Relevant given
   `docs/windows-support.md`.
4. **Discard ordering is unsafe.** `reviewStore.discard` awaits
   `close(pane.id)` before `reviewDiscard`. If the native call then throws,
   the pane is gone and the worktree has no route back into the UI.
5. **`review-file__path` uses `direction: rtl`** to keep the filename visible
   under ellipsis. It works for ASCII paths and mangles ordering for paths
   containing bidi-neutral characters. Use `text-overflow: ellipsis` with a
   leading-truncation approach instead.
6. **The picker chips are a broken tablist.** `role="tablist"` /
   `role="tab"` with no `aria-controls` and no tabpanel, while `DockTabs`
   three files away does the full pattern correctly. Same app, two idioms.

## Design Rules

These govern every screen below.

1. **One dock, one column, one reading order.** The dock stays a single
   scrolling column at compact width. Nothing in this plan introduces a
   second pane inside the dock, a nested scroll region, or a horizontal split
   below `wide`. Side-by-side diff appears only at `full`.
2. **Two levels, never three.** Fleet (all worktrees) → Changeset (one
   worktree). A file's diff expands in place inside Changeset. There is no
   third screen.
3. **Every count is live or labelled stale.** A number in this panel either
   updates itself or wears the time it was taken. No silently old numbers.
4. **Destructive actions never sit at the same weight as constructive ones.**
   Land is primary. Discard is a text button in the overflow, and always
   states what it deletes before it does it.
5. **The reserve rule is inviolable.** No feature here may make the dock's
   width change during a drag, and no feature may put a `backdrop-filter` on
   the dock. See the note at the top of `chrome.css`.
6. **Type and colour come from tokens.** `--fs-*`, `--fw-*`, `--line`,
   `--surface-tint`, `--success`, `--danger`, `--amber`. The only saturated
   things on this surface remain the diff's own +/− and the primary action.
7. **The row language is the shared one.** Reuse the Settings row/card
   vocabulary and `nav-segmented.css` rather than inventing a review-only
   idiom, exactly as the existing panel already does with the
   integration-account sub-panel.
8. **Nothing blocks on git.** Every git call is already off-thread through
   `run_blocking_core`; every new one stays that way, and every list that can
   grow is bounded and says so.

## Information Architecture

```
Dock ▸ Review
│
├── FLEET  (default when >1 worktree exists, or when none is selected)
│   ├── Header:  "6 workspaces · 3 ready · 1 overlap"     [Refresh] [⋯]
│   ├── Collision radar   (only when overlaps exist)
│   │     ⚠ 2 workspaces changed src/lib/dockLayout.ts
│   │       claude #3 · codex #5                      [Compare]
│   ├── Workspace rows (one per safe-mode pane)
│   │     ● claude #3   feat-auth      12 files  +340 −22   ready    [Land]
│   │     ◐ codex  #5   refactor-dock   4 files  +88  −140  working
│   │     ○ gemini #7   docs            0 files                       idle
│   │     ⊘ claude #9   (pane closed)   6 files  +91  −3    orphaned  [⋯]
│   └── Footer: [Land all that apply cleanly]     (only when ≥2 are ready)
│
└── CHANGESET  (one workspace; entered by clicking a row)
    ├── Back ‹ Fleet   ·  branch chip  ·  ● status  ·  [Refresh]
    ├── Tally:  12 files  +340 −22          [Select all] [None]
    ├── Overlap banner, if this workspace collides with another
    ├── File rows — checkbox · mark · path · ±counts · ⚠ overlap
    │     └── expanded: the diff reader
    └── Action bar:  [Land 12 files ▾]  [Pull request]  [⋯ Discard]
```

Entry points into Review, all of which must land on the right level:

| From | Lands on |
|---|---|
| Dock tab `Review` | Fleet if >1 workspace, else that workspace's Changeset |
| Pane header `Review` chip | That pane's Changeset |
| Notification "3 workspaces ready" | Fleet |
| Command palette "Review changes" | Fleet |
| Collision toast | Fleet, radar scrolled into view |

## Screen Specifications

### Fleet header

One line, three facts, in the panel's existing `review-head` rhythm:
`{n} workspaces · {r} ready · {c} overlap`. The overlap count is `--amber` and
only renders when non-zero. Refresh sits right, as today. The `⋯` opens
Housekeeping (below).

### Collision radar

The differentiator, and the thing to put in every piece of marketing.

Renders only when two or more live workspaces have a non-empty path
intersection. One row per contested path, each naming the workspaces and their
pane numbers, with a `Compare` action that opens a side-by-side of the two
worktrees' versions of that file.

Severity, computed from the intersection and the hunks:

| Level | Meaning | Colour |
|---|---|---|
| `touch` | Same file, non-overlapping hunk ranges | `--dim`, informational |
| `overlap` | Same file, overlapping hunk ranges | `--amber` |
| `conflict` | Same file, overlapping hunks, and one already landed | `--danger` |

`touch` is deliberately quiet — same-file edits in different functions are
normal and must not cry wolf. Only `overlap` and up produce a notification,
and only once per (path, workspace-pair), deduped through
`notificationStore`'s existing `dedupeKey`.

The radar updates while agents are still running. That is the whole point:
you learn about the collision at minute two, not at merge time.

### Workspace row

A single row in the shared row language:

- **Status dot**, reusing the pane `adot` classes so the dock and the grid
  agree at a glance: `working`, `idle`, `attention`, plus two review-only
  states, `ready` (idle with changes, unread) and `orphaned` (worktree exists,
  pane does not).
- **Agent mark + pane number**, so the row maps to a visible terminal.
- **Branch** — the `vibyra/` prefix stripped; it is noise in a list where
  every row has it.
- **Tally** — files, `+`, `−`, tabular-nums, right-aligned.
- **Overlap pip** when this workspace appears in the radar.
- **Inline `Land`** only on `ready` rows with no `overlap`-or-worse collision.
  A row with an unresolved overlap does not get a one-click land.
- Clicking anywhere else opens the Changeset.

Rows sort: ready first, then working, then idle, then orphaned. Within a
group, most recently changed first.

### Land all that apply cleanly

Visible only with two or more `ready` rows. Runs `git apply --check --3way`
for each workspace against the *current* checkout, sequentially, and lands the
ones that pass. Reports as a list: `Landed 3 · 1 needs attention`, with the
one that needs attention linked to its Changeset. Never partially applies a
workspace — the per-workspace all-or-nothing contract survives.

### Changeset: file selection and partial land

Each file row gains a checkbox, all checked by default. The action bar reads
`Land 12 files` and updates with the selection. Unchecking is how you leave
the agent's incidental reformatting behind.

Backend: `merge_back` grows a `paths: &[String]` parameter. When empty it
behaves exactly as today (whole worktree); when non-empty the `git diff` is
scoped with `-- <paths>` and the `git add -A` is scoped to the same set. The
existing all-or-nothing property then applies *to the selection*: either every
selected file lands, or none do.

The split button's `▾` offers `Land and discard workspace` — the common
finishing move, one action instead of two.

### Conflict resolution

When `--3way` cannot resolve, the outcome is no longer a dead-end sentence.
The panel renders the blocked files and three routes:

1. **Land the rest** — re-run with the blocked files deselected. One click,
   and it is honest about what it is leaving behind.
2. **Rebase in the workspace** — run
   `git rebase <project-head>` inside the worktree and re-check. Wholly
   contained in the worktree; the user's checkout is never touched. If the
   rebase itself conflicts, fall to route 3.
3. **Send it back to the agent** — the terminal is right there. Types a
   prepared prompt into the pane's PTY naming the conflicting files and the
   project's current content, and returns you to the Fleet. This is the
   move nobody else can make, because nobody else has the agent and the
   review in the same window.

Route 3 goes through the same fingerprint guard that
[[Agent Prompt Notifications]] established before any keystroke reaches a PTY.
No exceptions.

### Diff reader

- **Virtualised.** A windowed list over the parsed hunks, so a 512 KiB diff
  costs the same as a 2 KiB one. This replaces the 400-line cap; the cap and
  its "show all" button go away entirely.
- **Parsed into hunks**, not lines, so context can collapse. Default: three
  lines of context, with `⋯ 24 unchanged lines` expanding in place.
- **Word-level intra-line highlight** on modified line pairs. A one-character
  change should not read as a whole-line rewrite.
- **Syntax highlighting** by extension, at a deliberately low ceiling — token
  colours only, no language server, no bundle over ~40 KB. Falls back to plain
  when the language is unknown.
- **Side-by-side at `full` size only.** Unified everywhere else. The mode is
  not a user setting; it follows the dock size, which is already a control the
  user has.
- **Keyboard**: `j`/`k` move file rows, `Enter` expands, `n`/`p` move hunks,
  `Space` toggles selection, `/` searches within the open diff. Announced in
  the panel's help affordance and registered in Settings → Shortcuts.

### Housekeeping — Settings ▸ Safe workspaces

A new Settings section, in the established Settings row/card vocabulary. Lists
every `vibyra/*` worktree the app can find via `git worktree list --porcelain`
across known projects, whether or not a pane owns it:

- path, branch, project, age, on-disk size, and whether a pane is attached,
- per-row `Open review` / `Discard`,
- a `Remove orphaned workspaces` action for everything with no pane and no
  changes,
- disk total for the whole `terminal-worktrees/` root.

Plus an automatic reaper at app start: `git worktree prune` on each known
project, delete `vibyra/*` branches whose worktree is gone *and* which are
merged into the project head, and delete stray `*.vibyra-merge.patch` and
`snapshot-*.index` files. Never touches a worktree with unmerged changes, and
never touches a branch outside `vibyra/`.

### Notification and badge

- `DockTabs` `Review` tab carries a count badge of `ready` workspaces. The
  badge reuses the existing pill token set, not a new one.
- A workspace transitioning `working → idle` with a non-empty changeset raises
  one `agent`-tier notification: `claude #3 finished · 12 files ready to
  review`, deduped per pane per transition.
- A new `overlap` collision raises one `app`-tier notification at `warn`.
- Both respect the existing OS-eligibility rules; neither is sticky.

## State And Data Plan

### Native additions (`vibyra-core`)

| Item | Where | Notes |
|---|---|---|
| `merge_back(.., paths: &[String])` | `review/merge.rs` | Empty slice = today's behaviour |
| `--3way` on both check and apply | `review/merge.rs` | Base commit is present; this is free |
| `rebase_worktree(worktree, onto)` | `review/merge.rs` | Contained in the worktree; guarded by `vibyra_branch` |
| `list_worktrees(project_root)` | `review/registry.rs` (new) | `git worktree list --porcelain`, `vibyra/*` only |
| `prune_worktrees(project_root)` | `review/registry.rs` (new) | Prune, reap merged branches, sweep stray files |
| `worktree_status` scoped to repo root | `review/status.rs` | Fix finding 1; keep `-- .` behind a flag if a subfolder scope is wanted |
| `untracked_files` truncate-then-read | `review/status.rs` | Fix finding 2; use `map_parallel` for the reads |
| `conflict_paths` Windows-safe split | `review/merge.rs` | Fix finding 3 |
| `create_pr` base passed through | `commands/github.rs` | Plumbing already exists |

### Renderer additions

| Item | Where | Notes |
|---|---|---|
| `collisions(statuses)` | `lib/reviewCollisions.ts` (new) | Pure; path-set intersection then hunk-range comparison. Unit-tested like `reviewPolicy` |
| `fleetRows(panes, statuses, activity)` | `lib/reviewFleet.ts` (new) | Pure; the row model and its sort |
| `reviewStore.refreshAll()` | `state/reviewStore.ts` | Fans out over reviewable panes, single-flight per pane |
| `reviewStore.level` | `state/reviewStore.ts` | `"fleet" \| "changeset"`; not persisted — where you were is not a preference |
| `reviewStore.selection` | `state/reviewStore.ts` | `Record<paneId, Set<path>>`, defaulting to all |
| `reviewStore.orphans` | `state/reviewStore.ts` | From `list_worktrees`, minus panes |
| Status watcher | `state/reviewWatch.ts` (new) | Refreshes a pane's status on its `working → idle` edge and on debounced `fsVersion`; never polls |

The watcher deliberately keys off the activity edge rather than a timer. The
existing ticker already computes it, an idle agent is exactly the "ready"
moment, and a timer over six worktrees would run `git diff` continuously for
no reason.

### Component plan (all under the 200-line rule)

```
components/review/
  ReviewPanel.tsx          routes fleet ↔ changeset, owns nothing else
  fleet/
    ReviewFleet.tsx        header + radar + rows + land-all footer
    ReviewFleetRow.tsx     one workspace row
    ReviewRadar.tsx        collision list
    ReviewRadarRow.tsx     one contested path
  changeset/
    ReviewChangeset.tsx    back-bar, tally, file list, action bar
    ReviewFileRow.tsx      existing, plus checkbox and overlap pip
    ReviewSelectionBar.tsx select-all / none / count
    ReviewConflictPanel.tsx  the three routes
  diff/
    ReviewDiffView.tsx     virtualised host
    ReviewDiffHunk.tsx     one hunk, collapsed context
    ReviewDiffLine.tsx     one line, word-level marks
    diffParse.ts           unified diff → hunks; pure, unit-tested
    diffWords.ts           intra-line word diff; pure, unit-tested
  ReviewActions.tsx        existing, split button + overflow
  ReviewPrSheet.tsx        existing, plus base-branch picker
```

`styles/dock-review.css` grows a fleet section and a diff section, keeping the
existing comment header and its stated rules — the tinted sub-panel with
hairlines stays the file-list idiom, and the fleet rows use it too.

## Implementation Sequence

Each phase ships standalone, passes the gate, and leaves the app better than
it found it. No phase depends on a later one.

### Phase 0 — Correctness and foundations (no new UI)

1. `--3way` on check and apply in `merge::apply`.
2. `merge_back` takes `paths`; renderer passes an empty slice for now.
3. `worktree_status` scoped to the repo root; document the subfolder decision.
4. `untracked_files`: truncate before reading, and read in parallel.
5. `conflict_paths`: Windows-safe path extraction.
6. `reviewStore.discard`: remove the worktree *first*, close the pane second,
   so a native failure leaves the pane and its route intact.
7. `review/registry.rs`: `list_worktrees` + `prune_worktrees`, with tests.

**Ships:** merges that used to fail on context drift now succeed. Nothing
visible changes; everything gets more reliable.

### Phase 1 — The Fleet

1. `lib/reviewFleet.ts` and its tests.
2. `reviewStore`: `level`, `refreshAll`, `orphans`.
3. `ReviewFleet` + `ReviewFleetRow`; `ReviewPanel` becomes a router.
4. Entry-point routing per the table above.
5. Dock tab badge.

**Ships:** one glance answers "who is done?" for the whole fleet.

### Phase 2 — Collision radar

1. `lib/reviewCollisions.ts` — path intersection, then hunk-range comparison
   parsed from the diffs already fetched. Tests for `touch` / `overlap` /
   `conflict`.
2. `ReviewRadar` + `ReviewRadarRow`, the `Compare` side-by-side.
3. `state/reviewWatch.ts` — activity-edge and fs-debounced refresh.
4. Overlap notification, deduped per workspace pair per path.

**Ships:** the differentiator. Collisions surface while agents are still
running.

### Phase 3 — Landing lane

1. Per-file selection in the Changeset; `merge_back` gets the real path list.
2. Split `Land` button with `Land and discard workspace`.
3. `ReviewConflictPanel` — land-the-rest, rebase-in-workspace, send-to-agent.
4. `rebase_worktree` native, guarded.
5. `Land all that apply cleanly` on the Fleet footer.

**Ships:** conflicts stop being a dead end.

### Phase 4 — Diff craft

1. `diffParse.ts`, `diffWords.ts` and their tests.
2. Virtualised `ReviewDiffView`; the 400-line cap is deleted.
3. Collapsed context, word-level marks, extension-keyed syntax colours.
4. Side-by-side at `full`.
5. Keyboard model, registered in Settings → Shortcuts.

**Ships:** the review is pleasant to actually read, at any size.

### Phase 5 — Housekeeping

1. Settings → Safe workspaces, in the shared Settings vocabulary.
2. Start-up reaper.
3. Disk totals and the orphan sweep.

**Ships:** the leak is closed, visibly.

### Phase 6 — GitHub continuity

1. Base-branch picker in `ReviewPrSheet`; pass `base` through.
2. PR state on the workspace row — open / checks / merged — via `gh pr view
   --json`, fetched on demand, never polled.
3. "Merged upstream" offers to discard the workspace.

**Ships:** the PR stays visible until it is done.

### Phase 7 — Launch coordination (exploratory)

Deliberately last and deliberately smallest. `runLaunch` opens N identical
terminals with no scoping. The cheapest real improvement is a per-terminal
task line in the launcher — N text fields, each seeding its terminal's opening
prompt — so a fleet launch is N *different* jobs instead of N identical ones.
Anything more ambitious (automatic scope assignment, agents reading each
other's radar) is research, not plan.

## Validation Matrix

| Area | How it is proven |
|---|---|
| `--3way` | Rust test: project moves ahead in a different hunk of the same file; merge succeeds where plain apply fails |
| Scoped merge | Rust test: 5 changed files, 3 selected, exactly 3 land, 2 remain in the worktree |
| Subfolder scope | Rust test: agent edits a file outside the project subfolder; it appears in status and lands |
| Untracked ceiling | Rust test: >2,000 untracked files returns `truncated: true` without reading all of them |
| Windows conflict paths | Rust test over a `C:\...` stderr fixture |
| Registry | Rust test: worktree removed on disk, `prune_worktrees` reaps its merged branch and leaves an unmerged one |
| Collisions | Node tests over fixture statuses: disjoint, same-file-different-hunk (`touch`), overlapping (`overlap`) |
| Fleet rows | Node tests: sort order across ready/working/idle/orphaned |
| Diff parse | Node tests: renames, binary files, no-newline-at-EOF, CRLF, empty diff |
| Virtualisation | Render a 20,000-line diff; assert DOM node count stays bounded |
| Discard ordering | Node test: native discard rejects; pane still exists and is still routable |
| Dock reserve | Manual: drag the grip with 6 terminals open; xterm refits exactly once, on release |
| Keyboard | Manual: complete a land from the Fleet using only the keyboard |
| Accessibility | The picker becomes a real tablist or stops claiming to be one; radar rows are a list; every count has an accessible name |

Gate for every phase: `npm --prefix desktop-tauri run lines`, `typecheck`,
`test`, `build`, and `cargo test` in `src-tauri`. Verify in a clean worktree,
never the working tree — see [[release-pipeline-blockers]].

## Acceptance Criteria

1. With six safe-mode terminals running, the Review tab shows a badge with the
   number ready, and one click shows all six with live counts.
2. Two agents editing the same file produces a radar entry *while both are
   still running*, and one notification, not two.
3. Landing a workspace whose file the project changed in a different region
   succeeds without user intervention.
4. Landing a workspace that genuinely conflicts offers three routes, and
   "land the rest" leaves the project in a valid state.
5. A 20,000-line diff opens without the dock stalling.
6. Closing a pane without discarding leaves a workspace that is visible,
   reviewable, and reapable — never invisible.
7. Nothing in this plan changes the dock's width during a drag.
8. Every file added or edited stays under 200 lines.

## Explicit Non-Goals

- No merge-conflict *text editor* in the dock. Route 3 hands conflicts to the
  agent that is already open; Vibyra is not becoming a merge tool.
- No git history browsing, blame, or staging UI. This is review of one
  changeset against one base, not a git client.
- No cloud state. Worktrees, branches and reviews stay local, and GitHub stays
  behind `gh`, exactly as [[Tauri Account Authentication]] keeps auth behind
  the official tool.
- No automatic landing without user action, in any phase, ever.
- No third navigation level inside the dock.

## Why This Is The Marketing Story

The current pitch is "run many AI agents at once." Every competitor says that.

The pitch this plan enables is the one nobody else can make:

> Six agents, six isolated branches, one control tower. Vibyra tells you who
> finished, warns you when two agents reach for the same file *before* either
> is done, and lands all six changesets into your project without you
> resolving a single conflict by hand.

Three concrete assets fall straight out of the build:

1. **The radar clip.** Two agents, both editing `dockLayout.ts`, the amber row
   appearing on its own while both terminals are still scrolling. Six seconds,
   no narration needed. This is the hero asset.
2. **The land-all clip.** Fleet with four ready rows → one click → `Landed 4`.
3. **The conflict clip.** A real conflict, "send it back to the agent", the
   prompt appearing in the terminal, the agent fixing it, the row turning
   green. This is the shot that shows the terminal and the review being in one
   window is not a layout choice — it is the mechanism.

Sequence the marketing to match: Phase 2 unlocks asset 1, Phase 3 unlocks
assets 2 and 3. Do not shoot anything before Phase 2 lands.

## Source Ownership

- `desktop-tauri/src/components/review/**`: the Review tool, both levels.
- `desktop-tauri/src/lib/reviewPolicy.ts`, `reviewCollisions.ts`,
  `reviewFleet.ts`: pure decisions, no React.
- `desktop-tauri/src/state/reviewStore.ts`, `reviewWatch.ts`: review state and
  its refresh triggers.
- `desktop-tauri/src-tauri/crates/vibyra-core/src/review/**`: status, diff,
  merge, registry.
- `desktop-tauri/src-tauri/crates/vibyra-core/src/workspace.rs`: worktree
  creation and the snapshot contract. Do not change without re-reading its
  test.
- `desktop-tauri/src/styles/dock-review.css`: the panel's visual language.

---

# As Built — 2026-08-28

Phases 0–6 are implemented. What follows is the record of what shipped, what
was deliberately not built, and the things the build discovered that the plan
above did not anticipate. Where this section and the plan disagree, this
section is what is on disk.

## What the build discovered

Three findings that changed the design, all of them safety-relevant.

**`git apply --3way` implies `--index`.** On a dirty checkout it refuses
outright (`does not match index`), and otherwise it *stages* what it lands.
Either behaviour would have broken the contract `prepare_safe_workspace` keeps
on the way in — Vibyra never touches the user's index. Every `git apply` now
runs against a throwaway `GIT_INDEX_FILE` seeded with `read-tree HEAD` +
`add -A`, deleted afterwards, named `snapshot-merge-*.index` so the
housekeeping sweep already knows to reap it if a merge dies mid-flight. The
working tree still receives the changes; the real index is never opened.

**`git apply --3way --check` exits 0 having resolved *with conflict markers*.**
Exit status alone is not the gate, and trusting it would have written markers
into the user's files while reporting success. The check's stderr is parsed for
`Applied patch to '<path>' with conflicts.` and any hit refuses the whole
merge. `conflicts::unresolved` deliberately ignores `error:` lines on a zero
exit, because three-way narrates harmless fallbacks there.

**Per-file diffs were already broken for subfolder projects.** `--name-status`
emits repo-root-relative paths, but `file_diff` passed those as a pathspec with
`-C` set to the project subfolder, so the pathspec never matched and every diff
silently fell through to the untracked branch. Fixed by anchoring status, diff
and merge at the worktree root, which also closes the plan's finding 1 (work
outside the project subfolder was invisible to review and dropped by merge).

## Shipped, by phase

**Phase 0** — three-way merge through a scratch index; `merge_back(…, paths)`
scoping both the stage and the diff so all-or-nothing holds over the selection;
worktree-root anchoring; `untracked_files` truncating before it reads and
reading through `map_parallel`; Windows-safe conflict-path parsing (split out
to `review/conflicts.rs`); `review/registry.rs` with `list_worktrees` and
`prune_worktrees`, the latter deleting only `vibyra/*` branches that are
already merged.

**Phase 1** — the Fleet level: header facts, workspace rows on the shared
`adot` language, orphan rows, and the Review tab's ready-count badge.
`.adot--ready` uses `--accent` rather than a second green, because `working`
already owns green and those two states must never blur.

**Phase 2** — the collision radar. Grading is `touch` / `overlap` / `conflict`
with a three-line context gutter, because a unified diff carries three lines
of context either side and hunks closer than that cannot be applied
independently. `touch` is never shown as a radar row and never notifies — two
agents editing different functions in one file is the normal shape of parallel
work, and announcing it is how a radar becomes noise. Ranges are read only for
paths two workspaces share, capped at 60 diffs per refresh.

**Phase 3** — per-file selection, partial land, the split `Land and discard
workspace`, and the conflict panel's routes.

**Phase 4** — the diff reader: hunk parser, word-level intra-line marks,
collapsed context, an old/new line-number gutter, and a windowed list whose
DOM node count is bounded by the viewport rather than the diff. The 400-line
cap and its "Show all" button are gone.

**Phase 5** — Settings ▸ Safe workspaces, with a bounded native disk walk
(`workspaces_disk_usage`, 300k-entry ceiling, never follows symlinks) that
reports "at least 1.2 GB" on an exhausted budget rather than a fabricated
total.

**Phase 6** — base-branch picker (a failed branch listing degrades to exactly
the old behaviour) and on-demand PR state, graded pessimistically: one red
check beats every green.

## Deliberately not built

- **The start-up reaper.** Everything on the housekeeping pane deletes work,
  and a launch-time delete the user never asked for is not housekeeping. Only
  the manual `Remove orphaned workspaces` action ships. A test asserts
  `reviewPruneWorktrees` is reachable from nowhere else, so adding a reaper
  later has to be a deliberate decision rather than a drift.
- **Rebase in the workspace** (conflict route 2). No native command; the
  button renders disabled and says so rather than doing nothing quietly.
- **A real side-by-side compare** in the radar. The `Compare` affordance is
  honest about going to that workspace's changeset.
- **Phase 7 launch coordination.** Untouched, and still research rather than
  plan.

## Two corrections to the plan above

**Conflict route 3 is implemented, and the plan's caution about it was
misplaced.** The plan pointed at `agentPromptScan`'s fingerprint guard, which
is the wrong precedent: that guard answers a question the agent is already
asking, with a single validated keystroke, and exists because a mis-timed
keystroke there could approve something. Sending free text the user asked to
send is a different act with no such hazard, and it already has a sanctioned
path — the command palette's `!` mode and voice dictation both use
`writeTerminal` with `notePromptInput` first. `lib/reviewHandback.ts` composes
the brief and takes that path. The brief names the files and the branch but
prescribes no git command, because the agent is already inside the worktree
and knows its own branch, and a guessed `git rebase <branch>` is worse than
none.

**The discard ordering was reversed.** The plan inherited the old rule —
close the pane, then remove the worktree — on the reasoning that a terminal
running inside a deleted folder is a broken shell. It is, but closing first
meant a native failure left the pane gone *and* the worktree stranded with no
route back into the app. Removal now goes first and fails safe; the close
follows immediately on success. `safeWorkspaceReview.test.mjs` pins the new
order and the reasoning.

## Verification

Baseline before the work: 434 Node tests, 0 files over 200 lines.
After: **549 Node tests**, 0 files over 200 lines, `check:dead-code` clean,
`rust:fmt` / `rust:clippy -D warnings` / `rust:test` all green, `build` green.

Not yet done: **nobody has looked at this running.** Every gate is static or
unit-level. The UI has not been exercised against real worktrees in the app,
and that is the next thing to do — see the Validation Matrix's manual rows
(dock reserve during a drag, a keyboard-only land, a 20,000-line diff).
