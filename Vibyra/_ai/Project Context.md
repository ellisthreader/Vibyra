# Project Context

Vibyra is a mobile command center for AI software workflows running on the user's own machine.

## Current Shape

- Expo React Native app at `src/`.
- Local desktop bridge at `desktop/`.
- Laravel/backend app at `backend/`.
- Obsidian vault at `Vibyra/`.

## Important Files

- `src/context/AppContext.tsx`: wires app state, pairing, workspace, live sync, cloud sync, and agent actions.
- `src/context/useAgentActions.ts`: starts mobile chat or paired desktop agent runs.
- `src/context/usePairingActions.ts`: handles pairing between phone and desktop.
- `src/context/useWorkspaceActions.ts`: loads projects and files through the desktop connection.
- `desktop/lib/routes.mjs`: desktop HTTP route dispatcher.
- `desktop/lib/agent.mjs`: local desktop agent task runner and run artifact writer.
- `desktop/lib/projects.mjs`: discovers local projects.
- `desktop/lib/pairingHandlers.mjs`: pairing, health, preview start, and auth flow.

## How To Use This Note

Agents should read this note before broad repo exploration, then read `Memory Protocol.md` and one domain note:

- App/mobile work: `Vibyra App Memory.md`
- Desktop bridge work: `Vibyra Desktop Memory.md`
- Cloud chat / credits / OpenRouter cost work: `Vibyra Backend Memory.md`

Prefer reading the specific files listed in the domain note, then search narrowly for symbols or errors.

## Active Goal

Use Obsidian as a compact project memory layer so future agent sessions spend fewer tokens rediscovering project structure and decisions.
