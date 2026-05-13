# Backend - Desktop Agent Backend

Read this for Laravel desktop-agent execution, locks, stale active-run recovery, and project-file state.

## Files

- `backend/routes/web.php`
- `backend/app/Http/Controllers/VibyraDesktopController.php`
- `backend/app/Http/Controllers/Concerns/AgentExecution.php`
- `backend/app/Http/Controllers/Concerns/AgentLocking.php`
- `backend/app/Http/Controllers/Concerns/StatePersistence.php`
- `backend/app/Http/Controllers/Concerns/ProjectFileState.php`
- `backend/app/Http/Controllers/Concerns/ProjectDiscovery.php`

## Route Shape

The Laravel desktop route is the OpenRouter-backed desktop agent path. It differs from the Node desktop bridge, which is local and not a real AI generator.

Desktop project ids fail closed: `ProjectDiscovery::projectById` returns `null` for unknown ids instead of falling back to the first project.

Empty `projectPath` must not be trusted because PHP `realpath('')` resolves to the current backend directory.

## Locks And Stale Runs

`/agents/start` treats `activeAgentRun` as stale after 240s and clears it before rejecting; `/events` performs the same recovery for live sync.

`activeAgentRun` entries with missing or invalid `updatedAt`/`startedAt` timestamps are treated as stale immediately. This prevents old/corrupt run markers from permanently blocking new project AI requests.

Busy `/agents/start` responses include `busyReason` and `activeAgentRun` metadata (`title`, `projectName`, `projectPath`, `model`, `progress`, `startedAt`, `elapsedSeconds`) so mobile can show where the blocking request is running.

`AgentLocking` must only set `lastPromptCompletedAt` when a real active run existed. Validation errors such as unknown project, long prompt, missing key, or empty prompt must not trigger the 8s cooldown.
