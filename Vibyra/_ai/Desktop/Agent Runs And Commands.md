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

- Node desktop bridge (`desktop/lib/agent.mjs`) is the paired-phone local workspace execution path and calls OpenRouter directly.
- Laravel desktop route (`VibyraDesktopController::startAgent`) is the backend-hosted OpenRouter desktop agent path.

Node desktop `/agents/start` is now the paired-phone local workspace execution path for explicit build/edit/fix/debug/refactor/style/preview prompts. It calls OpenRouter using `OPENROUTER_API_KEY` from the process, `backend/.env`, or `.env`, reads root `AGENTS.md` / `.agents/AGENTS.md`, merges `/desktop/context` snippets, selected-file context, and recent chat history, then asks the model for a fenced JSON `{ "files": [...] }` payload with complete relative file replacements.

Desktop OpenRouter env lookup must work regardless of launch directory. `desktop/lib/agent.mjs` checks env files under both `process.cwd()` and the repo root derived from the module path, so launching from `desktop/` still finds repo-root `.env` and `backend/.env`.

Do not add local template fallbacks that pretend to satisfy user prompts. If OpenRouter returns no valid file edits, `/agents/start` returns a completed no-edit result and writes nothing.

`desktop/lib/agent.mjs` stages generated file replacements as pending changes, writes `.vibyra-agent/runs/<run-id>.md` only when edits are applied, updates preview/app state after apply, returns run metadata to the phone, and can write compact Obsidian run notes with frontmatter tags `vibyra/run` and `generated`.

## Permission Gate

`/agents/start` accepts `apply`. With `apply: false`, it returns pending changes plus `pendingApplyId` without committing file edits. `/agents/apply` commits the pending run and `/agents/discard` drops it.

Mobile sends `apply: true` only for project-scoped Allow always.

Generated file paths are constrained to relative paths under the approved project root. Absolute paths, `..`, `.git`, `.expo`, `.vibyra-agent`, `node_modules`, and `vendor` are rejected.

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
