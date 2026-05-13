# Desktop - Shell

Read this for `/desktop`, desktop visual work, static shell assets, auth gate, and launcher behavior.

## Files

- `desktop/app.html`
- `desktop/index.html`
- `desktop/assets/app.auth.css`
- `desktop/assets/app.auth.js`
- `desktop/assets/app.1.js`
- `desktop/assets/app.2.js`
- `desktop/assets/app.1.css` through `desktop/assets/app.7.css`
- `desktop/lib/routes.mjs`
- repo-root `Vibyra Desktop` launcher

## Desktop Recreation

`Vibyra/_ai/Desktop App Implementation Spec.md` and `Vibyra/_ai/Mobile App Desktop Recreation Spec.md` are deep references only. Use them when recreating broad desktop screens, not for routine bridge/debug tasks.

`/desktop` serves `desktop/app.html`, a static Vibyra shell with left rail, top bar, Dashboard, Projects, AI Chat, Community, Profile, pairing modal, token modal, and responsive mobile dock. `desktop/index.html` remains the legacy bridge screen.

`desktop/lib/routes.mjs` serves mobile app imagery under `/app-assets/...` from `src/assets/` so the shell can reuse app assets.

The static shell must not invent account balances, profile identity, community posts, or project counts. Account/billing panels stay unavailable or phone-managed until a real desktop account API exists.

Wording is desktop-owned and phone-facing: connection status says `Connected to phone`, pairing chrome uses phone language, and project filters read `Desktop`/`Phone` instead of mobile-side `PC`.

## Auth Gate

`/desktop` loads a mobile-auth-style front screen before the shell. The local desktop session is visual-only and stored in `localStorage` under `vibyra.desktop.auth`; billing/token balances still require real mobile account data.

## Home And Projects

Desktop Home live builds are compact list rows, not progress estimates. Show running rows above waiting rows, with duration and a three-dot action. Do not show bars, token counts, percentages, or predicted completion. `/desktop/state` exposes lightweight `activeAgentRun` metadata for this.

Projects layout should match the full-width screenshot style: toolbar below top bar, three-card grid on wide screens, 176px cards, 16px padding, about 14px column gap and 16px row gap, active card with purple border.

## Diagnostics

If `/desktop` renders blank after shell edits, inspect Chrome console first. Known regression: `app.1.js` uses `icon()` from `app.2.js`; keep `app.2.js` loaded before `app.1.js`, then `app.auth.js`.

Launcher port checks should use `lsof -nP -tiTCP:${PORT} -sTCP:LISTEN`. If a non-Vibyra listener owns the port, print `ps -o pid=,cmd= -p "$PORT_PIDS"` and suggest `kill <pid>`.
