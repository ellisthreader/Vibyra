# Mac storyboard redesign — implementation plan (2026-10-04)

Source of truth: the owner-approved storyboard (Design canvas
`https://claude.ai/artifact/NokAAkcpUMwCiisJPUFFNy`, page "Storyboard", frames
S1–S6). Base: installed Mac build 54 (0.8.21), commit `5223a7b5`, branch
`ui/mac-storyboard-20261004` in `~/Desktop/Vibyra-storyboard-20261004`.

## Owner decisions (2026-10-04)
- One identical frame on every screen: full-height left sidebar, top bar with a
  left location trail, centred Code/Agents pill and right actions, thin status
  bar at the bottom. Settings stay exactly as they are. The right-hand companion
  sidebar stays. No Grid/Focus toggle.
- Agents: opening a teammate shows an Overview (real data only) with tabs
  Overview · Chat · Runs · Access · Memory. No invented spend figures.
- Frame 4 (Code review) is skipped: build 54 has no Code view.
- No per-pane message box: terminals keep their own input.
- No git branch / line counts: the window has no git data in this line.

## Real data only
| Storyboard element | Source in build 54 |
| --- | --- |
| Workspace block | `accountStore.snapshot.profile` (name, plan) → Settings › Account |
| Search ⌘K | `workspaceStore` palette (existing ⌘K) |
| Needs you | panes with `activity === "attention"` (as Home's attention button) |
| Project status dots/lines | `terminalStore` panes + activity, `lastOpenedMs` |
| Device status | `phoneStore.status.active` (iPhone), this Mac always ready |
| Update state | `updateStore` |
| Pane status pill | `TerminalPaneCard` state label (Working / Needs you / Ready …) |
| Teammate Last run / Recent runs | `runsV2` list (`agents/v2/runs`) |
| Teammate Next run | routines `nextRunLocal` when a schedule exists |
| Budget per task | `teammate.budget` |

## Phases
1. Foundations: SF Pro UI font (Inter fallback on Linux), radius 8/12,
   sliding pill, storyboard stylesheets under `src/styles/storyboard/`.
2. Frame: sidebar header (workspace, search, Home, Needs you), top bar,
   new `StatusBar`.
3. Home (S1): Projects cards + Recent chats.
4. Terminals (S2/S3): unified pane header, active ring, zoom tab strip.
5. Agents (S5): rail restyle, teammate Overview page.
6. Verification: build, tests, line gate, fixtures + screenshots vs storyboard,
   signed bundle for the owner to install.
