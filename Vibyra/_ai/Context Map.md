# Context Map

Use this map to choose the smallest useful context. Read one domain index and one focused note unless the task clearly crosses domains.

## Multi-Project Note

This vault holds memory for more than one project. The domain notes below default to **Vibyra**.

- **RelayClarity** (separate repo `/home/ellis/Desktop/RelayClarity`): read `01 Projects/RelayClarity/RelayClarity Memory.md` first. Do NOT apply Vibyra notes to RelayClarity, or vice versa.
- **Hong Kong Express** (separate repo `/home/ellis/Desktop/HKE`): read `01 Projects/Hong Kong Express/HKE Memory.md` first, plus its `Lessons/` and `Incidents/` notes. HKE also has its own skill at `.claude/skills/hke-frontend-polish/`.

## Memory, Skills, And Planning

For memory/skill optimization, broad planning, or agent workflow changes, read
`Memory And Skills Optimization.md` plus the matching local skill. Common
matches: `vibyra-obsidian`, `plan`, `vibyra-refactor`, `vibyra-optimise`,
`vibyra-preview-diagnostics`, and `vibyra-expo-web-diagnostics`.

Claude Code also has global skills that apply here: `plan-build` (plan → review
→ safe implementation), `prove-it` (verification before claiming done),
`diagnose` (root-cause a bug instead of patching symptoms), `vibyra-clean-code`,
`vibyra-frontend-audit`, and `vibyra-vault-writeback`.

For Ellis's stable communication style, frontend taste, backend expectations,
and preferred agent behaviour, read `99 Meta/Ellis - Coding Memory.md`.
The current user message always overrides that profile.

For code cleanup, organization, API-compatible splitting, performance-safe
refactoring, or the hard 200-line source standard, read
`Code Organization And Refactoring Standard.md` and use `vibyra-refactor`.

## Product Surfaces

If “website,” “browser,” “phone app,” or “desktop app” could mean more than one
runtime, read `Product Surfaces.md` first. It separates the public Laravel
marketing website, Expo web browser client, native phone app, and the native
Tauri desktop app, and links to each domain note.

## Brand And Colour System

For palette, theme, brand-colour, focus, contrast, or cross-surface visual work,
read `Design/Graphite And Cobalt Colour System.md`. Graphite + Cobalt is the
approved shared system for desktop, Expo phone/browser, and marketing.

## Mobile App

Read `Vibyra App Memory.md`, then one focused note from `Vibyra/_ai/App/`.

- Broad AI chat routing: `App/AI Live Chat.md`
- Prompt routing, project briefs, reasoning effort: `App/Chat Prompt Routing.md`
- Slash commands and AI skills: `App/Chat Slash Commands.md`
- Streaming, code blocks, chat visual polish: `App/Chat Rendering UI.md`
- Edit approval, changed files, run artifacts: `App/Chat Code Changes.md`
- Detached chat folder/project intents: `App/Detached Chat Routing.md`
- Preview/WebView/blank preview: `App/Live Preview.md`
- Pairing/reconnect/Wi-Fi discovery: `App/Pairing And Connection.md`
- Projects tab, file browser, folder search: `App/Workspace Projects.md`
- `/api/session/state`, cloud sync: `App/Cloud Sync.md`
- Profile, billing, model locks: `App/Profile Billing.md`
- Bottom nav, app shell, broad UI: `App/Navigation UI.md`
- App Store and Google Play release audit: `App/App Store Production Readiness.md`
- Mobile/backend/desktop cybersecurity release audit: `App/Mobile Cybersecurity Review.md`
- Mobile/frontend design clarity from short-form product demos: `App/Short-Form Frontend Design Principles.md`
- Phone-only code organization, 200-line remediation, contexts, props/types, and runtime baselines: `App/Mobile Code Optimization Plan.md`

## Desktop App

Read `Vibyra Desktop Memory.md`, then one focused note from `Vibyra/_ai/Desktop/`.

- App launch and terminal launcher: `Desktop/Rust Tauri Desktop.md`
- Post-auth welcome: `Desktop/Rust Tauri First Welcome.md`
- Account auth and session storage: `Desktop/Tauri Account Authentication.md`
- Terminal performance and WebKit compositing: `Desktop/Tauri Terminal Performance Overhaul.md`
- Terminal panes, provider routing, launch settings: `Desktop/AI Terminals.md`
- Auth gate surface and Settings > Integrations: `Desktop/Desktop Shell.md`
- In-app report dialog and authenticated backend delivery:
  `Desktop/In-App Reporting.md`
- Workspace Preview: `Desktop/Projects And Preview.md`
- System-wide screenshot hotkey, crop/annotation, Copy/Save: `Desktop/Screenshot Capture.md`

## Backend

Read `Vibyra Backend Memory.md`, then one focused note from `Vibyra/_ai/Backend/`.

- `/api/chat`, OpenRouter, token caps: `Backend/Chat And Cost Controls.md`
- `/api/chat/team-plan`, strict Team assignment proposals: `Backend/Team Planning.md`
- Billing, credits, levels: `Backend/Billing Credits And Levels.md`
- Auth and cloud sync: `Backend/Auth And Cloud Sync.md`
- Authenticated Desktop reports and server-owned Discord delivery:
  `Desktop/In-App Reporting.md`
- Community publish/moderation/assets: `Backend/Community Publishing.md`
- App Store-safe static/Railway interactive demos for Explore: `Backend/Hosted Demos.md`
- Laravel desktop-agent route/locks: `Backend/Desktop Agent Backend.md`

## Cross-Domain Shortcuts

Pairing bugs: read `App/Pairing And Connection.md`. Start near `src/context/usePairingActions.ts` and `src/context/pairingDiscovery.ts`.

Agent or prompt flow: read `App/Chat Prompt Routing.md`. Start near `src/context/useAgentActions.ts` and `src/context/agentTypes.ts`.

Backend account/cloud-sync errors: read `Backend/Auth And Cloud Sync.md` plus `App/Cloud Sync.md`. Start near `backend/routes/web.php`, `src/utils/appApi.ts`, and `src/context/useCloudSync.ts`.

OpenRouter cost tuning: read `Backend/Chat And Cost Controls.md`. Start near `ChatEndpoint.php`, `ChatPrompting.php`, and `src/context/useAgentActions.ts`.

Style or UI work: read `App/Navigation UI.md` unless the task names a more specific feature. Start near `src/styles/theme.ts`, `src/components/`, `src/screens/WorkspaceScreen.tsx`, and `src/screens/workspace/styles/`.

## Deep References

Do not read long specs, research files, or decision logs by default. Search them
with `rg` and open only the matching section:

- `Decisions.md`
- `Backend/AI Live Chat Backend Context.txt`
- `Backend/Railway Cloud Runtime.md`
- `Marketing/Competitor Marketing Analysis.md`
- `Marketing/Vibyra Marketing Website Master Plan.md`
- `Marketing/Vibyra Remotion Marketing Video Plan.md`
