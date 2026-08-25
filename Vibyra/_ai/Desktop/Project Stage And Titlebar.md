# Project Stage And Titlebar

Scope: the shell redesign that deleted the workspace mode bar, rebuilt the
titlebar, and turned Preview from a mode into a pane. Shipped 2026-08-25.

## What Was Wrong

The window counted live terminals in four places at once — the titlebar
wordmark's subtitle, a "N need you" chip, a "N live" chip, and the mode bar's
context string — and two of those sat in the one row of the app reserved for
things you press (`chrome.css` even marked the live chip `pointer-events:
none`). Separately, Preview was a *mode*: `WorkspaceApp` gated the rail and the
side panel on `projectMode === "terminals"`, so opening a preview unmounted the
terminals you were watching.

## The Shape Now

- **Titlebar** is identity, then intent, then state: wordmark, `ProjectSwitcher`
  (which absorbed the Home / Project breadcrumb and is where Home now lives),
  `CommandBar` in the centre, then `LayoutControl`, the side-panel toggle, the
  bell, the account menu and the window controls.
- **Bug report and update check moved into the account menu.** `UpdateNavAction`
  and `update-nav.css` were deleted; `navUpdateCopy` is unchanged and now feeds
  an `account-menu__update` entry.
- **The mode bar is gone entirely** (`project-modes.css` → `stage.css`). Its
  tabs became the layout control, its context string was deleted, zoom-exit is a
  floating pill on the stage, and the side-panel toggle went to the titlebar.
- **`projectMode` (2 values) → `stageLayout` (3) + `stageRatio`.** The layout is
  session state on `workspaceStore`; the ratio persists through
  `lib/stageLayout.ts` in localStorage, the same pattern as
  `companionPreferences.ts`. There is no settings-schema change.

## Three Rules That Are Load-Bearing

**`terminalsVisible(layout)` is the native flush budget.** The old code passed
`mode === "terminals" ? activeId : null` into `syncProjectVisibility`, so
choosing Preview sent every PTY to `hidden`. In a split the terminals are on
screen and must keep their delivery rate. Full preview is the only layout that
hides them. Same predicate guards `useFocusVisibility`. Getting this wrong
re-opens the terminal-lag work — see [[Tauri Terminal Performance Overhaul]].

**The collapsed pane is hidden, never unmounted.** `stage__pane--off` is
`display: none`, which takes it out of the grid so it costs no layout, but keeps
a running dev server and a pane's scrollback alive. Preview is mounted lazily on
first use and then stays for the project's session (`previewTouched` in
`ProjectWorkspace`), so someone who never opens it never starts it.

**Nothing about the stage animates.** xterm refits on every resize, so a width
transition would refit the whole grid once per frame for its duration. The
divider snaps. Do not add one.

## Source Ownership

- `src/lib/stageLayout.ts` — layout predicates, `grid-template-columns`, pointer
  and keyboard ratio maths, localStorage. Pure except the storage pair.
- `src/components/layout/{ProjectSwitcher,CommandBar,LayoutControl,StageSplit}.tsx`
- `src/styles/stage.css`, `src/styles/chrome-nav.css`
- `nav-segmented.css` still owns the segmented shape; `.stage-layout` joined its
  selector lists and takes only icon-only trim from `chrome-nav.css`.
- `chrome-account.css` now owns *both* titlebar dropdowns (`.account-menu` and
  `.chrome-menu`) so they cannot drift apart.
- Tests: `tests/stageLayout.test.mjs`.

## Where The Attention Signal Lives

Deleting the "N need you" chip did not delete the signal: the project tile
badge, the terminal row dot, the bell, and the prompt toast with its Approve and
Decline buttons all carry it. See [[Agent Prompt Notifications]].

## Checks

`npm --prefix desktop-tauri run verify`.
