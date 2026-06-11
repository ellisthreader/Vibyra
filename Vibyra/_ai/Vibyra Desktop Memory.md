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
- AI terminal tabs, provider routing, PTY/xterm sessions: `Desktop/AI Terminals.md`
- Dynamic Team decomposition, planner models, authoritative plan storage,
  transactional launch, rollout, and evaluation:
  `Desktop/AI Team Dynamic Planner Implementation Plan.md`
- Native provider CLI rollout, protocol matrix, and release gates: `Desktop/Native Provider Terminal Plan.md`
- Local Vibyra AI, Ollama runtime/model, local chat routing: `Desktop/Local Vibyra AI.md`
- AI-terminal Voice and canonical project Memory: `Desktop/Voice And Project Memory.md`
- System-wide F9 screenshot capture and annotation editor: `Desktop/Screenshot Capture.md`
- Pairing, bearer token, `/health`, phone session, LAN discovery: `Desktop/Pairing And Phone Session.md`
- Project discovery, browse/search, previews, project ids: `Desktop/Projects And Preview.md`
- Agent runs, apply/discard, safe commands, run artifacts: `Desktop/Agent Runs And Commands.md`

## Local Skills

- Use `.agents/skills/VibyraDesktopFrontendDesign/SKILL.md` for desktop frontend design work: mobile-inspired dark UI, minimal topbar/sidebar chrome, auth welcome polish, logo handling, recent chats, and responsive screenshot checks.
- Use `.agents/skills/vibyra-ai-terminal-diagnostics/SKILL.md` for AI terminal
  launch, UI ownership, hidden-engine, token-source/billing, PTY input,
  transcript, and recovered-worker failures.
- Use `.agents/skills/vibyra-preview-diagnostics/SKILL.md` for Desktop Test or
  phone Preview project detection, runtime startup, target/capability routing,
  proxy transport, WebView state, and shutdown failures.

## Runtime Branding

For Electron/GNOME app name, taskbar grouping, launcher metadata, or logo
problems, read `Desktop/Desktop Shell.md`. The visible app name is `Vibyra`;
the Linux identity is `vibyra.desktop` / `WM_CLASS=vibyra`; and the native
icon is the transparent login-page V exported as
`desktop/vibyra-login-logo.png`.

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

## Refactor Ownership

Desktop UI/static/session routes live in desktop/lib/desktopRoutes.mjs, with desktop/lib/routes.mjs kept as the HTTP dispatcher for desktop, pairing, and authenticated phone routes.

Desktop agent orchestration is split by concern: agent.mjs coordinates runs and safe commands; agentApply.mjs owns pending/apply result shaping and file writes; agentPrompting.mjs builds the OpenRouter request; agentGeneratedFiles.mjs validates generated file paths/content; agentConfig.mjs owns OpenRouter env lookup.

The static desktop shell keeps classic browser scripts but splits them by load-order ownership from desktop/app.html: state/shell/pages/boot, chat store/actions/send/render helpers/icons, profile state/render/actions, auth state/UI/session/billing/helpers/boot, and terminal state/store/render/controls/send/models/boot. Preserve script order when editing these files.

## Theme Ownership

Desktop light/dark mode is owned by the late-loaded `desktop/assets/app.theme*.css` layers, with `app.theme.css` defining the shared semantic tokens and the shell/chat/surfaces/terminals/auth theme files providing scoped overrides. Keep `desktop/app.html` loading those files after the page-specific polish sheets so they remain the final theme authority. The desktop theme audit is verified by `desktop/assets/app.desktop-theme-audit.test.mjs` and `desktop/assets/app.terminals-theme-audit.test.mjs`; keep them passing whenever theme tokens, auto-appearance handling, or semantic surface aliases change.
