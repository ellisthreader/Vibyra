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

`/desktop` serves `desktop/app.html`, a static Vibyra shell with a Chat-first layout, compact left rail, top bar, Projects, Builds, pairing modal, account/token modal, and responsive mobile dock. `desktop/index.html` remains the legacy bridge screen.

`desktop/lib/routes.mjs` serves mobile app imagery under `/app-assets/...` from `src/assets/` so the shell can reuse app assets.

The static shell must not invent account balances, profile identity, community posts, or project counts. Account/billing panels stay unavailable or phone-managed until a real desktop account API exists.

Wording is desktop-owned and phone-facing: connection status says `Connected to phone`, pairing chrome uses phone language, and project filters read `Desktop`/`Phone` instead of mobile-side `PC`.

## Auth Gate

`/desktop` loads a mobile-auth-style front screen before the shell. The local desktop session is visual-only and stored in `localStorage` under `vibyra.desktop.auth`; billing/token balances still require real mobile account data.

## Chat, Builds, And Projects

The desktop shell defaults to `chat`, mirroring the phone app's Chat-first direction. Keep primary rail destinations to Chat, Projects, and Builds; keep profile/billing/account details in the account modal instead of rail tabs unless real desktop account APIs require a fuller page.

Desktop visual overrides should use the mobile dark palette from `src/styles/theme.ts`: `#07070A` background, `#12121A` surfaces, `#160D2A` tint, and `#6D3BFF`/`#8B5CFF` purple accents. Keep the palette restrained and clean; do not reintroduce glow-heavy dashboard styling or fake marketing panels.

The Builds page must use real `/desktop/state` data only. Show `activeAgentRun` as compact rows with duration and a three-dot action. Do not show fake project counts, fake event counts, fallback build rows, progress bars, token counts, percentages, or predicted completion.

Projects layout should match the full-width screenshot style: toolbar below top bar, three-card grid on wide screens, 176px cards, 16px padding, about 14px column gap and 16px row gap, active card with purple border.

## Diagnostics

If `/desktop` renders blank after shell edits, inspect Chrome console first. Known regression: `app.1.js` uses `icon()` from `app.2.js`; keep `app.2.js` loaded before `app.1.js`, then `app.auth.js`.

Launcher port checks should use `lsof -nP -tiTCP:${PORT} -sTCP:LISTEN`. If a non-Vibyra listener owns the port, print `ps -o pid=,cmd= -p "$PORT_PIDS"` and suggest `kill <pid>`.
