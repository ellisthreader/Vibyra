# Project Context

Vibyra is a mobile command center for AI software workflows running on the user's own machine.

## Current Shape

- Expo React Native app at `src/`.
- Native Tauri desktop app at `desktop-tauri/`.
- Laravel/backend and public marketing website at `backend/`.
- Obsidian vault at `Vibyra/`.

The approved cross-surface visual system is Graphite + Cobalt. Read
`Design/Graphite And Cobalt Colour System.md` before palette or theme work;
purple, violet, pink, and magenta are no longer general Vibyra chrome colours.

Read `Product Surfaces.md` when distinguishing the public website, Expo browser
client, native phone app, and the Tauri desktop app.

All first-party source follows the cross-surface organization and hard 200-line
rules in [[Code Organization And Refactoring Standard]]. Use that note before
broad cleanup or structural refactoring.

## Important Files

- `src/context/AppContext.tsx`: wires app state, pairing, workspace, live sync, cloud sync, and agent actions.
- `src/context/useAgentActions.ts`: starts mobile chat or paired desktop agent runs.
- `src/context/usePairingActions.ts`: handles pairing between phone and desktop.
- `src/context/useWorkspaceActions.ts`: loads projects and files through the desktop connection.
- `desktop-tauri/src/App.tsx`: desktop auth gate and workspace mount.
- `desktop-tauri/src-tauri/src/lib.rs`: Tauri setup and native commands.
- `desktop-tauri/src-tauri/crates/vibyra-core/`: PTY, projects, previews, settings.

## How To Use This Note

Agents should follow the repo read order before broad exploration: `Memory Protocol.md`, `Context Map.md`, this note, one domain index, and one focused note when the domain index has topic notes:

- App/mobile work: `Vibyra App Memory.md`
- Desktop bridge work: `Vibyra Desktop Memory.md`
- Cloud chat / credits / OpenRouter cost work: `Vibyra Backend Memory.md`
- Cross-surface or marketing/browser/phone terminology: `Product Surfaces.md`

Prefer reading the specific files listed in the focused note, then search narrowly for symbols or errors.

## Active Goal

Use Obsidian as a compact project memory layer so future agent sessions spend fewer tokens rediscovering project structure and decisions.
