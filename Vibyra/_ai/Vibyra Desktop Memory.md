# Vibyra Desktop Memory

Scope: local desktop bridge in `desktop/`. Use this as the desktop index only.

## Mental Model

The desktop app is a local HTTP bridge. It shows/approves phone pairing, discovers local projects, serves previews, exposes a static desktop shell, runs safe commands, and applies/discards real pending edits.

## Start Files

- `desktop/local-app.mjs`: process entry.
- `desktop/index.html`: legacy bridge screen.
- `desktop/app.html`: static desktop shell.
- `desktop/lib/routes.mjs`: HTTP dispatcher.
- `desktop/lib/state.mjs`: process state, pair code, token, LAN URLs.

## Focused Notes

- Desktop shell UI, auth gate, launcher, static assets: `Desktop/Desktop Shell.md`
- Pairing, bearer token, `/health`, phone session, LAN discovery: `Desktop/Pairing And Phone Session.md`
- Project discovery, browse/search, previews, project ids: `Desktop/Projects And Preview.md`
- Agent runs, apply/discard, safe commands, run artifacts: `Desktop/Agent Runs And Commands.md`

## Local Skills

- Use `.agents/skills/VibyraDesktopFrontendDesign/SKILL.md` for desktop frontend design work: mobile-inspired dark UI, minimal topbar/sidebar chrome, auth welcome polish, logo handling, recent chats, and responsive screenshot checks.

## Route Groups

`desktop/lib/routes.mjs` splits requests into:

- desktop UI: `/desktop`, `/desktop/state`, `/desktop/approve`, `/desktop/deny`, `/desktop/quit`;
- pairing: `/health`, `/pair`, `/pair/status`, `/preview/project/...`;
- authenticated: `/projects`, `/events`, `/preview/start`, `/preview/start-server`, `/agents/start`, `/commands/run`.

Authenticated routes require `Authorization: Bearer ${TOKEN}`.

## Organization Rule

Desktop bridge source follows the 200-line app-source standard. Keep `desktop/lib/routes.mjs` as a dispatcher and delegate route behavior to focused modules. Static desktop assets are served through `desktop/lib/assetRoutes.mjs`; project metadata/create/browse behavior is split into `projectInfo.mjs`, `projectCreate.mjs`, and `projectBrowse.mjs`, with `projects.mjs` as a small public facade.

## Token Hint

For desktop tasks, read this index plus exactly one focused desktop note, then inspect only the route/helper files named there.
