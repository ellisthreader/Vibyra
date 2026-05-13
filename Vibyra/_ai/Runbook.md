# Runbook

## Local App

The Expo app reads `EXPO_PUBLIC_API_URL` from root `.env`; for LAN/device testing it should point to the dev machine on Laravel's API port, e.g. `http://192.168.1.109:8000`. The backend MUST be running before the app boots — otherwise the AI chat fails silently: foreground `/api/chat` POSTs reject with `Could not reach Vibyra at http://…:8000/api/chat`, the chat bubble shows the mapped "I could not reach Vibyra from the app." reply via `userFacingAgentError`, and the browser logs `ERR_CONNECTION_REFUSED` natively (not suppressible — see backend-offline gate decision).

One command to run both processes (Laravel + Expo) with `Ctrl+C` killing both:

```bash
npm run dev
```

Or split across two terminals:

```bash
# terminal 1 — backend (must be first)
npm run backend

# terminal 2 — Expo
npm start
```

Manual fallback if scripts fail or you want a fully detached server:

```bash
cd backend && php artisan serve --host=0.0.0.0 --port=8000
```

Quick liveness check:

```bash
curl -s http://127.0.0.1:8000/api/skills | head -c 80
# expect {"ok":true,"skills":[...
```

If signup/login shows "Could not reach Vibyra" or `failed to fetch`, check backend liveness before editing auth code. The app uses `EXPO_PUBLIC_API_URL` from root `.env`; both `http://127.0.0.1:8000/api/skills` and the configured LAN URL should answer while developing on web/device.

If the browser reports `AppEntry.bundle` 500 plus strict MIME refusal because the script response is `application/json`, fetch the bundle URL directly and read Metro's JSON error body. This is usually a build/resolver error, not a MIME problem. For `UnableToResolveError`, verify imported files exist, especially `src/context/translations.ts` versus `src/context/i18n/*.ts`. After creating a missing module, restart Expo if Metro keeps serving the stale resolver miss, then verify the bundle returns `Content-Type: application/javascript`.

Useful checks:

```bash
npm run typecheck
```

## Desktop Bridge

Desktop code is in `desktop/`.

Important routes:

- `GET /health`
- `POST /pair`
- `GET /pair/status`
- `GET /projects`
- `GET /events`
- `POST /agents/start`
- `POST /commands/run`

## Backend

Backend code is in `backend/`. It appears to be Laravel/PHP with its own Node/Vite frontend tooling.

Before backend edits, inspect `backend/README.md`, `backend/routes/`, and relevant controllers/models.

## Obsidian

Open the `Vibyra` vault. Use `Welcome.md` as the index.

Use the memory layer as a routing cache, not a transcript. Default path: `Memory Protocol.md` -> `Context Map.md` -> `Project Context.md` -> one domain index -> one focused note.

Update the smallest focused note with stable facts. Keep `Project Context.md` and domain indexes short. Put temporary notes in `Runs/` or task-specific files.

Treat `Decisions.md`, `Mobile App Desktop Recreation Spec.md`, and `Desktop App Implementation Spec.md` as deep references. Search them with `rg` and read the matching section instead of opening them end-to-end.

Desktop agent runs automatically save compact summaries to `_ai/Runs/` when they find a vault at either:

- `project/Vibyra`
- `project`
- `VIBYRA_OBSIDIAN_VAULT`

If the vault is moved, start the desktop bridge with:

```bash
VIBYRA_OBSIDIAN_VAULT=/absolute/path/to/vault npm run desktop
```

Generated run notes include `vibyra/run` and `generated` tags. Search those tags in Obsidian when reviewing recent agent activity.

## Local Agent Skills

`VibyraOptimse` lives at `.agents/skills/VibyraOptimse/SKILL.md`. Use it for future app audits that combine permission approval boundaries, code organization, optimization, and the source-file line limit.

Its standard workflow is:

- audit risky app actions for balanced approve/deny gates
- split providers, hooks, routes, components, and styles by real ownership
- enforce no app source file over 200 lines, excluding generated folders such as `tmp`, `node_modules`, `backend/vendor`, `.git`, `.expo`, and `.vibyra-agent`
- validate with `npm run typecheck`, `node --check` for changed desktop JS/MJS, and `php -l` for changed PHP

`VibyraObsiden` lives at `.agents/skills/VibyraObsiden/SKILL.md`. Use it whenever repo work should consume and maintain the Obsidian memory layer. It encodes the rule that durable architecture, workflow, route/API, permission, validation, debugging, and local-skill changes must be written to the smallest relevant note before final response.

`vibyra-desktop-connection-diagnostics` lives at `.agents/skills/vibyra-desktop-connection-diagnostics/SKILL.md`. Use it for phone-to-desktop pairing hangs, "Finding Vibyra Desktop", "Desktop lost the pairing request", stale remembered desktop tokens, Browse PC or `/open` timeouts, and connected-but-authenticated-route failures. It encodes the proven checks for idempotent `/pair` request IDs, approval UI visibility, fallback URL promotion, explicit stale-token deletion, and live-sync tolerance.
