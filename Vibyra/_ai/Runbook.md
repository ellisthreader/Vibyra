# Runbook

## Local App

Open Vibyra Desktop and the backend API first, then run:

```bash
npm start
```

The Expo app reads `EXPO_PUBLIC_API_URL` from root `.env`; for LAN/device testing it should point to the dev machine on Laravel's API port, for example `http://192.168.1.109:8000`. Start the backend from `backend/` with:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

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

Update `Project Context.md` only with stable facts. Put temporary notes in `Runs/` or task-specific files.

Desktop agent runs automatically save compact summaries to `_ai/Runs/` when they find a vault at either:

- `project/Vibyra`
- `project`
- `VIBYRA_OBSIDIAN_VAULT`

If the vault is moved, start the desktop bridge with:

```bash
VIBYRA_OBSIDIAN_VAULT=/absolute/path/to/vault npm run desktop
```

Generated run notes include `vibyra/run` and `generated` tags. Search those tags in Obsidian when reviewing recent agent activity.
