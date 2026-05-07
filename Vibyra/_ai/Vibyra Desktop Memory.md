# Vibyra Desktop Memory

Scope: local desktop bridge in `desktop/`.

## Mental Model

The desktop app is a local HTTP bridge. It shows a pair code, approves phone pairing, discovers local projects, serves previews, runs safe commands, and executes local agent tasks.

## Entrypoints

- `desktop/local-app.mjs`: desktop process entry.
- `desktop/index.html`: desktop UI.
- `desktop/lib/routes.mjs`: HTTP route dispatcher.
- `desktop/lib/state.mjs`: process state, pair code, auth token, allowed command set.

## Route Groups

`desktop/lib/routes.mjs` splits requests into:

- desktop UI routes: `/desktop`, `/desktop/state`, `/desktop/approve`, `/desktop/deny`, `/desktop/quit`;
- pairing routes: `/health`, `/pair`, `/pair/status`, `/preview/project/...`;
- authenticated routes: `/projects`, `/events`, `/preview/start`, `/agents/start`, `/commands/run`.

Authenticated routes require `Authorization: Bearer ${TOKEN}`.

## Pairing

`desktop/lib/pairingHandlers.mjs` owns:

- pair-code validation;
- pending pair state;
- desktop approval/denial;
- token handoff after approval;
- project discovery on approval;
- preview start response.

`desktop/lib/state.mjs` generates:

- `PORT`, default `4317`;
- `PAIR_CODE`, default random six-character code;
- `TOKEN`, default process-local token;
- LAN connection URLs.

## Project Discovery

`desktop/lib/projects.mjs` scans the current working directory and common user folders. It recognizes projects by markers like `package.json`, `.git`, `app.json`, `requirements.txt`, and `pyproject.toml`.

`desktop/lib/projects.mjs::projectById` returns `null` for unknown project ids. Do not reintroduce fallback-to-first-project behavior; stale mobile ids should fail clearly instead of running against an unrelated project.

## Agent Runs

There are two desktop-agent implementations in the repo:

- Node desktop bridge (`desktop/lib/agent.mjs`) uses a local/template run path and does not call OpenRouter.
- Laravel desktop route (`backend/routes/web.php` -> `VibyraDesktopController::startAgent` -> `VibyraDesktopState`) is the OpenRouter-backed desktop agent path.

`desktop/lib/agent.mjs` currently:

- creates `.vibyra-agent/runs/<run-id>.md`;
- writes `index.html` preview output in the selected project;
- updates `appState.latestPreview`;
- returns agent/change/file/event metadata to the phone;
- writes compact Obsidian run notes to `_ai/Runs/` when a vault is found;
- adds frontmatter tags to generated run notes: `vibyra/run` and `generated`.

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

## Token Hints

For desktop tasks, start with this note plus `routes.mjs` and only the route handler file related to the request.
