# Runbook

## Local App

The only Expo app is `mobile/`, beginning at “Build from your pocket.”

```bash
npm ci --prefix mobile
bash host/scripts/build-wasm.sh
npm run phone
```

Use SDK 57 Expo Go and the matching CLI account. Keep Metro detached for phone
QR sessions. Verify the owning checkout, LAN manifest and native launch bundle
before sharing the address; `expo whoami` alone does not prove device discovery.
Root `start`, `dev`, `web`, `ios`, and `android` delegate to `mobile/`.
Settings > Show welcome again returns to the first page.

Read `App/iOS Remote Workspace.md` and the Expo diagnostics skill for details.
The former root client, backend-plus-legacy-Expo launcher and old screenshots
are removed. Run `npm run backend` separately when developing the Laravel API.

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

Treat long specs, research files, and decision logs as deep references. Search
them with `rg` and read the matching section instead of opening them end-to-end.
Examples: `Decisions.md`, `Backend/AI Live Chat Backend Context.txt`,
`Backend/Railway Cloud Runtime.md`, and
`Marketing/Competitor Marketing Analysis.md`.

Desktop agent runs automatically save compact summaries to `_ai/Runs/` when they find a vault at either:

- `project/Vibyra`
- `project`
- `VIBYRA_OBSIDIAN_VAULT`

If the vault is moved, set the vault path in the environment that starts the
desktop app:

```bash
VIBYRA_OBSIDIAN_VAULT=/absolute/path/to/vault npm --prefix desktop-tauri run app:dev
```

Generated run notes include `vibyra/run` and `generated` tags. Search those tags in Obsidian when reviewing recent agent activity.

## Local Agent Skills

Use local skills as active task instructions whenever their trigger matches the
work. Before broad exploration, read the relevant skill from `.agents/skills/`
and follow its workflow. When a task changes or confirms a durable workflow,
diagnostic, validation command, design rule, or permission rule covered by a
skill, update the smallest relevant skill before final response. Keep Obsidian
as the routing memory for when to use a skill; keep detailed operating rules in
the skill itself.

`vibyra-optimise` lives at `.agents/skills/VibyraOptimse/SKILL.md`. Use it for future app audits that combine permission approval boundaries, code organization, optimization, and the source-file line limit.

Its standard workflow is:

- audit risky app actions for balanced approve/deny gates
- split providers, hooks, routes, components, and styles by real ownership
- enforce no app source file over 200 lines, excluding generated folders such as `tmp`, `node_modules`, `backend/vendor`, `.git`, `.expo`, and `.vibyra-agent`
- validate with `npm run typecheck`, `node --check` for changed desktop JS/MJS, and `php -l` for changed PHP

`vibyra-refactor` lives at `.agents/skills/VibyraRefactor/SKILL.md`. Use it when the task is primarily safe code cleanup: oversized files, messy organization, too many parameters, weak typing, missing contexts/hooks/modules, or a no-source-file-over-250-lines gate. It exists because broad refactors must not be declared complete until the final line gate is clean and validation commands have clean exit codes. It also records the lessons from the May 2026 refactor: check the full source scope, investigate non-zero test exits even when assertions pass, delete empty placeholder tests after splitting, and state generated/cache/temp/vendor exclusions explicitly.

The canonical cross-surface examples and formulation rules are in
`Vibyra/_ai/Code Organization And Refactoring Standard.md`. Read it before a
broad cleanup batch; keep the original facade/API stable, split by named
responsibility, validate runtime return shapes as well as types, and enforce the
200-line limit across every extracted descendant in the frozen scope.

`vibyra-obsidian` lives at `.agents/skills/VibyraObsiden/SKILL.md`. Use it whenever repo work should consume and maintain the Obsidian memory layer. It encodes the rule that durable architecture, workflow, route/API, permission, validation, debugging, and local-skill changes must be written to the smallest relevant note before final response.

Phone-to-desktop pairing failures ("Finding Vibyra Desktop", "Desktop lost the pairing request", stale remembered desktop tokens, Browse PC or `/open` timeouts, connected-but-authenticated-route failures): read `App/Pairing And Connection.md`. The proven checks are idempotent `/pair` request IDs, approval UI visibility, fallback URL promotion, explicit stale-token deletion, and live-sync tolerance. (The former `vibyra-desktop-connection-diagnostics` skill was deleted; recover it from git commit `45ea9ae` if the full checklist is needed again.)

`plan` lives at `.agents/skills/plan/SKILL.md`. Use it for broad or multi-step work where Codex should restate the goal, make and review a practical plan, simplify the plan before editing, implement in scoped steps, verify, and update durable memory or skills.
