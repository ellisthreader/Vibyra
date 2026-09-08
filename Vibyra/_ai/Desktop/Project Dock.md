# Project Dock

Scope: the floating right-hand project panel and the titlebar controls that
open, size, switch, and close it.

## Interaction Contract

- `workspaceStore.dockTool` owns visibility: a tool id means open and `null`
  means closed. `dockSize` independently remembers compact, wide, or full.
- The titlebar keeps three size icons, not a fourth close button. Choosing an
  inactive size opens or resizes the dock; pressing the active size closes it.
  The active button must expose `Close dock` as its tooltip and accessible name.
- Keep `workspaceStore.setDockSize` open-only because command-palette and
  shortcut callers use it to request a size. The active-size close branch
  belongs in `DockSizeControl` and delegates to `toggleDock`.
- The active tool in `DockTabs` remains a second close path. Closing never
  forgets the last tool, so reopening returns to useful content.

## Source Ownership

- `desktop-tauri/src/components/layout/DockSizeControl.tsx`: three titlebar
  buttons and the active-size close interaction.
- `desktop-tauri/src/components/dock/DockTabs.tsx`: tool switching and the
  active-tool close interaction.
- `desktop-tauri/src/state/workspaceStore.ts`: dock visibility, size, and last
  tool state.
- `desktop-tauri/src/lib/dockLayout.ts`: dock geometry, persistence, and
  terminal-visibility predicates.

## Checks

Run `npm --prefix desktop-tauri run lines`, `typecheck`, `test`, and `build`.
For interaction changes, render the real control and verify open, close, and
reopen clicks rather than relying only on source inspection.
