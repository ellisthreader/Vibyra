# Desktop - Agent Runs And Commands

Read this for desktop agent behavior, apply/discard permissions, run artifacts, vault lookup, and safe commands.

## Files

- `desktop/lib/agent.mjs`
- `desktop/lib/agentTemplates.mjs`
- `desktop/lib/routes.mjs`
- `desktop/lib/state.mjs`
- Backend OpenRouter path: `backend/routes/web.php`, `backend/app/Http/Controllers/VibyraDesktopController.php`

## Agent Implementations

There are two desktop-agent implementations:

- Node desktop bridge (`desktop/lib/agent.mjs`) uses a local run path and does not call OpenRouter.
- Laravel desktop route (`VibyraDesktopController::startAgent`) is the OpenRouter-backed desktop agent path.

Node desktop `/agents/start` is not a real AI generator. Do not use it for arbitrary app/site/game creation or add local template fallbacks that pretend to satisfy user prompts. It should own pairing, folders, files, preview serving, and apply/discard of real pending edits.

`desktop/lib/agent.mjs` writes `.vibyra-agent/runs/<run-id>.md`, updates preview/app state, returns run metadata to the phone, and can write compact Obsidian run notes with frontmatter tags `vibyra/run` and `generated`.

## Permission Gate

`/agents/start` accepts `apply`. With `apply: false`, it returns pending changes plus `pendingApplyId` without committing file edits. `/agents/apply` commits the pending run and `/agents/discard` drops it.

Mobile sends `apply: true` only for project-scoped Allow always.

## Vault Lookup

Vault lookup order:

- `VIBYRA_OBSIDIAN_VAULT`
- `<project>/Vibyra`
- `<project>`

## Safe Commands

`desktop/lib/state.mjs` allows only:

- `git status`
- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
- `pytest`

Mobile chat intercepts natural-language terminal requests before `/api/chat` in `workspacePromptActions.ts`. `git status` can run directly through `useTerminalCommandActions` and `/commands/run`; install/dev/build/test commands require an explicit yes/no follow-up in chat before execution. Unsupported commands return the allowlist instead of going to OpenRouter, so models should not answer "I cannot run terminal commands directly" for supported project commands.
