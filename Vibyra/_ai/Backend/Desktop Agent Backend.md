# Backend - Desktop Agent Backend

Read this for Laravel desktop-agent execution, locks, stale active-run recovery, and project-file state.

## Files

- `backend/routes/web.php`
- `backend/app/Http/Controllers/VibyraDesktopController.php`
- `backend/app/Services/Concerns/AgentExecution.php`
- `backend/app/Services/Concerns/AgentLocking.php`
- `backend/app/Services/Concerns/StatePersistence.php`
- `backend/app/Services/Concerns/ProjectFileState.php`
- `backend/app/Services/Concerns/ProjectDiscovery.php`

## Route Shape

The Laravel desktop route is the OpenRouter-backed desktop agent path. It differs from the Node desktop bridge, which is local and not a real AI generator.

The Node desktop bridge normally listens on `4317`; the Laravel backend normally listens on `8000` via `npm run backend`/`npm run dev`. Laravel `StatePersistence::connectionUrls()` must advertise the Laravel backend port, not the Node bridge port, or paired phones can be promoted toward the non-generating bridge.

Desktop project ids fail closed: `ProjectDiscovery::projectById` returns `null` for unknown ids instead of falling back to the first project.

Empty `projectPath` must not be trusted because PHP `realpath('')` resolves to the current backend directory.

## Locks And Stale Runs

`/agents/start` treats `activeAgentRun` as stale after 240s and clears it before rejecting; `/events` performs the same recovery for live sync.

`activeAgentRun` entries with missing or invalid `updatedAt`/`startedAt` timestamps are treated as stale immediately. This prevents old/corrupt run markers from permanently blocking new project AI requests.

Busy `/agents/start` responses include `busyReason` and `activeAgentRun` metadata (`title`, `projectName`, `projectPath`, `model`, `progress`, `startedAt`, `elapsedSeconds`) so mobile can show where the blocking request is running.

If `agent.lock` is held but `activeAgentRun` is empty after stale recovery, `/agents/start` returns a lock cleanup error without `activeAgentRun`. Do not fake active-run metadata in that case; mobile should show a plain retry message instead of a Thinking/Building progress block.

`AgentLocking` must only set `lastPromptCompletedAt` when a real active run existed. Validation errors such as unknown project, long prompt, missing key, or empty prompt must not trigger the 8s cooldown.
