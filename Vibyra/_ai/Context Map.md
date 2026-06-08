# Context Map

Use this map to choose the smallest useful context. Read one domain index and one focused note unless the task clearly crosses domains.

## Memory, Skills, And Planning

For memory/skill optimization, broad planning, or agent workflow changes, read
`Memory And Skills Optimization.md` plus the matching local skill. Common
matches: `VibyraObsiden`, `plan`, `VibyraRefactor`, `VibyraOptimse`,
`VibyraDesktopFrontendDesign`, `vibyra-desktop-connection-diagnostics`, and
`vibyra-expo-web-diagnostics`.

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
- Mobile/frontend design clarity from short-form product demos: `App/Short-Form Frontend Design Principles.md`

## Desktop Bridge

Read `Vibyra Desktop Memory.md`, then one focused note from `Vibyra/_ai/Desktop/`.

- Shell UI/auth gate/launcher: `Desktop/Desktop Shell.md`
- AI terminal tabs, provider routing, PTY/xterm sessions: `Desktop/AI Terminals.md`
- Local Vibyra AI, Ollama, model/runtime status: `Desktop/Local Vibyra AI.md`
- AI-terminal voice and editable project memory: `Desktop/Voice And Project Memory.md`
- Pairing/phone session/LAN URLs: `Desktop/Pairing And Phone Session.md`
- Discovery/browse/search/preview: `Desktop/Projects And Preview.md`
- Agent runs/apply-discard/safe commands: `Desktop/Agent Runs And Commands.md`

## Backend

Read `Vibyra Backend Memory.md`, then one focused note from `Vibyra/_ai/Backend/`.

- `/api/chat`, OpenRouter, token caps: `Backend/Chat And Cost Controls.md`
- Billing, credits, levels: `Backend/Billing Credits And Levels.md`
- Auth and cloud sync: `Backend/Auth And Cloud Sync.md`
- Community publish/moderation/assets: `Backend/Community Publishing.md`
- App Store-safe static/Railway interactive demos for Explore: `Backend/Hosted Demos.md`
- Laravel desktop-agent route/locks: `Backend/Desktop Agent Backend.md`

## Cross-Domain Shortcuts

Pairing bugs: read `App/Pairing And Connection.md` plus `Desktop/Pairing And Phone Session.md`. Start near `src/context/usePairingActions.ts`, `src/context/pairingDiscovery.ts`, `desktop/lib/pairingHandlers.mjs`, and `desktop/lib/state.mjs`.

Agent or prompt flow: read `App/Chat Prompt Routing.md` plus `Desktop/Agent Runs And Commands.md` if desktop apply/run behavior matters. Start near `src/context/useAgentActions.ts`, `src/context/agentTypes.ts`, `desktop/lib/agent.mjs`, and `desktop/lib/routes.mjs`.

Backend account/cloud-sync errors: read `Backend/Auth And Cloud Sync.md` plus `App/Cloud Sync.md`. Start near `backend/routes/web.php`, `src/utils/appApi.ts`, and `src/context/useCloudSync.ts`.

OpenRouter cost tuning: read `Backend/Chat And Cost Controls.md`. Start near `ChatEndpoint.php`, `ChatPrompting.php`, and `src/context/useAgentActions.ts`.

Style or UI work: read `App/Navigation UI.md` unless the task names a more specific feature. Start near `src/styles/theme.ts`, `src/components/`, `src/screens/WorkspaceScreen.tsx`, and `src/screens/workspace/styles/`.

## Deep References

Do not read long specs, research files, or decision logs by default. Search them
with `rg` and open only the matching section:

- `Decisions.md`
- `Backend/AI Live Chat Backend Context.txt`
- `Backend/Railway Cloud Runtime.md`
- `Desktop/AI Terminal Provider CLI Research.txt`
- `Desktop App Implementation Spec.md`
- `Mobile App Desktop Recreation Spec.md`
- `Marketing/Competitor Marketing Analysis.md`
