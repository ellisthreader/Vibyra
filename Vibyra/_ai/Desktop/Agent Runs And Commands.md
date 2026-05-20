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

## Multi-Agent State

Node desktop bridge uses `desktop/lib/agentRunState.mjs` plus `appState.agentRuns` for run-scoped progress. `/desktop/state` and `/events` expose `agentRuns` and keep `activeAgentRun` as a derived compatibility field. `/agents/start` still returns the existing phone response shape, but no longer blocks on a single global active run.

Concurrent running/applying runs are capped by `desktopAccount.maxConcurrentAgents` when present, clamped to the local MVP ceiling of 12; otherwise the local cap is 12. Waiting pending-apply runs do not count against the active cap, but `desktop/lib/agent.mjs` keeps the per-project pending apply lock and rechecks before storing generated edits so two pending approvals cannot conflict in the same project.

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


## PTY Desktop Terminals

Desktop AI terminals now have a separate real terminal path from the legacy simulated chat-terminal route. /desktop/pty-terminals creates local-only PTY sessions for codex, claude, gemini, or a login shell; /desktop/pty-terminals/:id/socket streams input/output over a loopback-only WebSocket. The frontend override lives in desktop/assets/app.terminals-pty.js and keeps the existing terminal tabs/setup shell while routing keystrokes directly to the PTY. The existing /commands/run allowlisted buffered route remains unchanged for phone/mobile-approved safe commands.

Start backend inspection at desktop/lib/ptyTerminals.mjs, desktop/lib/aiTerminalProcess.mjs, desktop/local-app.mjs, and desktop/lib/desktopRoutes.mjs; start UI inspection at desktop/assets/app.terminals-pty.js and desktop/assets/app.terminals.pty.css.

PTY provider terminals resolve local CLIs before spawning. `desktop/lib/aiTerminalProcess.mjs` reports availability for Codex, Claude, Gemini, and Shell; `desktop/lib/ptyTerminals.mjs` returns `agents` from `/desktop/pty-terminals` and creates an `unavailable` terminal with an install/config hint instead of spawning a missing binary. Gemini can be supplied with `VIBYRA_GEMINI_CLI` or `GEMINI_CLI_PATH` when it is not on `PATH`. The browser PTY renderer uses `@xterm/xterm` loaded through `desktop/assets/vendor.xterm.js` and `desktop/assets/vendor.xterm.css`; live output is written directly into xterm and should not trigger full terminal page re-renders. `desktop/assets/app.runtime-fixes.css` loads last from `desktop/app.html` to pin chat/terminal heights, composer stacking, and xterm viewport sizing. `desktop/lib/ptyTerminals.mjs` must not inject local startup banners into PTY output, because provider CLIs like Claude need a clean terminal stream for 1:1 rendering.
