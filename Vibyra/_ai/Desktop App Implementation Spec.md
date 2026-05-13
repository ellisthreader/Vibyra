# Vibyra Desktop App Implementation Spec

Deep reference: do not read this file for normal desktop bridge work. Use `Vibyra Desktop Memory.md` plus one focused `Desktop/` note first; search this spec only for desktop recreation layout/API acceptance details.

Purpose: companion build handoff for `Mobile App Desktop Recreation Spec.md`. Use this when implementing the desktop recreation. The recreation spec defines visual/product fidelity; this file defines layout, state, API contracts, and acceptance criteria.

## Implementation Goal

Build a desktop Vibyra app that preserves the mobile product model while making better use of desktop space.

Required outcomes:

- Same app states: auth, onboarding, workspace.
- Same five workspace destinations: Dashboard, Projects, AI Chat, Community, Profile.
- Same dark-first brand system, logo, page titles, copy, and assets.
- Desktop-native layouts for wide screens without changing product hierarchy.
- Direct integration with the local desktop bridge and backend account/chat/billing APIs.

## App Shell Layout

Use three responsive shells.

Narrow, under 720px:

- Reuse the mobile layout.
- Top bar fixed.
- Floating bottom nav.
- Chat hides bottom nav.

Medium, 720-1024px:

- Use compact left rail or bottom dock.
- Content gutter: 18-24px.
- Max content width: 900px.
- Modals may remain sheet-like, but centered dialogs are preferred.

Wide, over 1024px:

- Use persistent left rail.
- Rail width: 92px collapsed, 184-220px expanded if labels are always visible.
- Top bar height: 72-80px.
- Main content max width: 1180-1280px.
- Main content gutter: 24-32px.
- Chat transcript max width: 860-980px.

Recommended wide structure:

```text
+------------+----------------------------------------------+
| Left rail  | Top bar                                      |
|            +----------------------------------------------+
| Nav        | Main page content                            |
|            |                                              |
+------------+----------------------------------------------+
```

Left rail:

- Logo at top from `src/assets/vibyra.png`.
- Nav order: Home, Projects, Chat, Community, Profile.
- Use Ionicons matching mobile page registry.
- Active item uses the same purple background/border language as mobile bottom nav.
- Token pill should stay in top bar, not rail.

Top bar:

- Dashboard: connection switcher block on left, token pill on right.
- Projects/Community/Profile: page title left, token pill right.
- Chat: back/new-chat region left, centered or left-aligned chat title, rename/delete actions right.
- Community detail: back, selected post title, token pill.

## Page Layouts

Dashboard wide layout:

- Two-column grid: `minmax(0, 1.35fr) minmax(320px, 0.65fr)`.
- Left column: `Ready to build` status panel, then `Live builds`.
- Right column: four home action cards, token/plan summary, optional recent activity.
- Preserve mobile copy: `Ready to build`, `Live builds`, `Quiet for now`, `Create your first build`.

Projects wide layout:

- Top toolbar row: `Create Project`, `Browse PC`, search, filter.
- Project cards grid: 2 columns at 1024px, 3 columns above 1360px.
- Search should filter immediately.
- Filter modes: All, PC, Mobile.
- Empty state remains `No projects match this view.`
- Folder browser opens as centered modal or right drawer.

AI Chat wide layout:

- Full-height chat area with no bottom nav.
- Transcript centered with max width 860-980px.
- Empty state centered vertically until conversation starts.
- Composer fixed at bottom of chat pane, not viewport if app has a rail/top bar.
- Composer max width matches transcript.
- Model and reasoning menus open as popovers anchored to their buttons.
- Message list must auto-follow only when near the bottom.
- App preview opens in a large modal with a desktop web frame.

Community wide layout:

- Top row: filter tabs and search.
- Feed grid: 2 columns on wide screens, 1 column under 900px.
- Detail view: either full page with comments right rail or modal drawer.
- Keep seeded posts and accents from `src/screens/workspace/data/community.ts`.

Profile wide layout:

- Two-pane settings:
  - Left pane width: 360-420px.
  - Right pane: selected setting detail or sheet content.
- Profile hero sits at top of left pane.
- Settings groups remain ACCOUNT, PREFERENCES, SUPPORT.
- On narrow widths, keep mobile sheet behavior.

Billing wide layout:

- Large modal or profile right pane.
- Header: `Pick your plan`, token count, close/back action.
- Cycle toggle above plan cards.
- Plan cards in 4 columns where space allows; 2 columns below 1100px.
- Keep Free, Starter, Builder, Pro details and annual/monthly toggle.

## Core State Model

Mirror these mobile state groups from `src/context/useAppState.ts`:

- Auth/account: `authenticated`, `authToken`, `accountId`, `accountPlan`, `authName`, `authEmail`, `creditsBalance`, `creditsUsed`.
- Onboarding: `onboardingComplete`.
- Desktop connection: `paired`, `agentUrl`, `pairCode`, `pairing`, `pairingError`, `pairingMessage`, `healthMessage`, `checkingHealth`, `pendingPhoneApproval`, `connection`, `rememberedDesktops`, `machineName`.
- Workspace: `projects`, `selectedProjectId`, `files`, `selectedFileId`, `buildState`, `previewState`.
- AI: `selectedModel`, `selectedChatModel`, `reasoningEffort`, `agents`, `agentRequesting`, `taskText`, `chatThreads`, `chatTitles`, `chatSkills`, `editApprovals`.
- Activity: `logs`, `changes`, `workflowIndex`, `lastPrompt`.

Important domain types from `src/types/domain.ts`:

- `Project`: `id`, `name`, `path`, `stack`, `updated`, optional `source`.
- `AgentConnection`: `url`, `token`, `machineName`, optional `connectionUrls`.
- `RememberedDesktop`: `url`, `machineName`, `pairCode`, optional `token`, `status`, timestamps.
- `ChatMessage`: role/text plus optional generated app, code changes, files, edit approval, folder proposal/recovery.
- `GeneratedApp`: `id`, `title`, optional `html` or `url`.
- `ReasoningEffort`: `none`, `low`, `medium`, `high`, `xhigh`.

Persistence:

- Keep persisted auth/session/app state compatible with `src/utils/persistence`.
- Remember selected chat model, remembered desktops, chat threads, chat titles, selected model, edit approvals, and prompt money.
- Desktop recreation must not lose existing account state if it shares the same backend session model.

## Desktop Bridge API Contract

Base URL:

- Default local desktop port: `4317`, from `VIBYRA_AGENT_PORT`.
- Requests normalize base URLs before use.
- Authenticated bridge routes require header `Authorization: Bearer <desktop token>`.

Pairing and health:

- `GET /health`
  - Public.
  - Response includes `ok`, `machineName`, `pairCode`, `paired`, `pairedDevice`, `startedAt`, `preview`, `connectionUrls`.
- `POST /pair`
  - Public.
  - Body: `{ code: string, deviceName: string }`.
  - On matching code: `202` with `{ ok: true, status: "pending", requestId, machineName }`.
  - On mismatch: `401` with `Pair code does not match`.
- `GET /pair/status?requestId=<id>`
  - Public.
  - Pending: `{ ok: true, status: "pending", machineName }`.
  - Approved: `{ ok: true, status: "approved", token, machineName, projects, events }`.
  - Denied: `403` with `Desktop denied pairing`.

Desktop UI/control:

- `GET /desktop/state`
  - Public.
  - Returns public desktop state: machine name, pair code, paired/pending device, latest preview, events, connection URLs, cached projects.
- `POST /desktop/approve`
  - Public from local desktop UI.
  - Approves pending pair and discovers projects.
- `POST /desktop/deny`
  - Public from local desktop UI.
  - Denies pending pair.
- `POST /desktop/quit`
  - Public from local desktop UI.
  - Closes desktop server.

Authenticated desktop/project routes:

- `GET /projects`
  - Returns `{ projects }`.
- `POST /projects/create`
  - Body: `{ name: string }`.
  - Returns `{ project, projects, files, events }`.
- `GET /desktop/folders`
  - Returns `{ folders }`.
- `GET /desktop/search?q=<query>`
  - Returns `{ matches }`.
- `GET /desktop/browse?path=<path>`
  - Returns `DesktopBrowseListing`: `current`, `parentPath`, `entries`.
  - With no path, returns common roots.
  - Selected browsed folders are cached as projects.
- `GET /files?projectId=<id>`
  - Returns `{ files }`.
- `GET /files/read?projectId=<id>&path=<path>`
  - Returns `{ file }`.
- `POST /files/create`
  - Creates a project file.
- `GET /events`
  - Returns `{ events, preview, selectedProjectId, activeAgentRun }`.
- `POST /preview/start`
  - Body includes `projectId`.
  - Returns `{ preview, events }`.
- `POST /agents/start`
  - Starts an agent task.
  - Mobile timeout is 190 seconds; desktop UI should show long-running state.
- `POST /commands/run`
  - Runs safe commands only.
  - Allowed commands: `git status`, `npm install`, `npm run dev`, `npm run build`, `npm test`, `pytest`.

Preview route:

- `GET /preview/project/<projectId>/<token>/`
  - Public-ish by token path.
  - Serves project preview through the desktop bridge.

Request behavior:

- GET requests for browse/files/projects/events may try fallback connection URLs.
- Timeouts:
  - `/agents/start`: 190s.
  - `/commands/run`: 25s.
  - `/desktop/browse`: 15s.
  - `/files`: 15s.
  - `/files/read`: 10s.
  - `/projects`: 15s.
  - Default: 5s.

## Backend API Contract

Backend base URL:

- `EXPO_PUBLIC_API_URL` when set.
- Otherwise LAN Expo host on port `8000` for native.
- Otherwise `http://127.0.0.1:8000`.

Known frontend response types from `src/utils/appApi.ts`:

- Auth response: `{ ok, token, user }`.
- Session response: `{ ok, user }`.
- Billing plans response: `{ ok, plans, topups, currency, vatInclusive }`.
- Checkout response: `{ ok, url }`.
- Chat skills response: `{ ok, skills }`.
- Chat response: `{ ok, reply, app, title, model, modelKey, creditCost, creditsBalance, creditsUsed, dailyCreditsUsed, dailyCreditsCap, user }`.

Remote user fields:

- `id`, `name`, `email`, `plan`, `creditsBalance`, `creditsUsed`, `onboardingComplete`, `rememberedDesktops`, optional billing cycle, renewal date, caps, model tiers, and `appState`.

Background behavior:

- Background sync/probes should skip when backend is marked offline unless explicitly allowed.
- Foreground backend failures should show actionable connection or auth errors.

## Key Interactions

Auth:

- Google, Apple, and email options must preserve current labels.
- Email can switch signup/login mode.
- Legal links remain visible.

Onboarding:

- Each step must block continue until valid according to mobile `canContinueFromStep`.
- Persona calculation should match mobile logic.
- Pricing can be skipped/closed only where mobile allows completion.

Pairing:

- User enters pair code or selects nearby desktop.
- Pair request enters pending state.
- Desktop approval returns token and projects.
- Denial and mismatch must show clear error states.
- Remember successful desktops and show current/online/offline/checking status.

Projects:

- Create project opens project chat/preview flow.
- Browse PC lets user adopt a folder as a project.
- Do not run actions against stale project IDs; unknown project should fail clearly.

Chat:

- `/help`, `/clear`, `/new`, `/open` handled locally.
- Model selection must respect plan locks.
- Reasoning effort defaults to `medium`.
- Low credits warning appears when remaining percent is low.
- Edit approvals, denied edits, undo, folder recovery, and generated app previews must remain supported.

Community:

- Likes/bookmarks/comments can be local-first as mobile currently does.
- Opening an app uses the post's app URL or in-app preview flow.

Profile:

- Billing opens checkout/portal where backend token exists.
- No token fallback opens `https://vibyra.app/billing/...`.
- Appearance/language choices persist.
- Logout confirmation must be explicit.

## Error And Empty States

Required states:

- Backend offline.
- Desktop not reachable.
- Pair code mismatch.
- Pair approval pending.
- Pair denied.
- No projects.
- No matching project search results.
- No chat messages.
- Low credits.
- Locked model requires upgrade.
- Agent request running too long.
- Preview unavailable.
- File read/create failure.

Use Vibyra tone:

- Short, direct messages.
- No generic stack traces.
- Use purple/info, green/success, amber/warning, red/danger visual states.

## Visual Acceptance Criteria

The desktop app is visually faithful when:

- The first viewport clearly reads as Vibyra through logo, dark shell, and purple glow language.
- The five nav destinations match mobile labels and icon choices.
- Top bar connection and token pill are always visible outside chat.
- AI Chat empty state uses `ai-chat-glyph-focused.png`.
- Auth uses `front-auth.jpg`.
- Onboarding uses existing icon and persona assets.
- Cards, tabs, pills, modals, and buttons use the same dark translucent surfaces and border/glow colors.
- No top-level tab introduces decorative hero art that mobile intentionally removed.
- Desktop adds columns and panes, but does not add marketing sections.

## Functional Acceptance Criteria

Auth/onboarding:

- A signed-out user sees auth.
- A signed-in user who has not completed onboarding sees onboarding.
- A signed-in onboarded user lands in workspace.
- Auth/session state persists across reloads.

Workspace:

- Dashboard shows connection state, token balance, project count, model label, live builds, and four home actions.
- Projects can list, search, filter, create, rename/archive/delete locally where supported, and browse PC folders.
- Chat can start a new detached chat from nav and a project chat only after project selection.
- Chat can submit agent requests to desktop or backend according to existing routing.
- Community can filter/search, open detail, like/bookmark/comment, and open an app preview/link.
- Profile can edit/open all listed settings areas and billing.

Desktop bridge:

- `/health` works without auth.
- Pairing requires correct code and desktop approval.
- Authenticated requests reject missing/invalid tokens.
- Project discovery and browse use real desktop folders.
- Preview start returns a live preview object.
- Agent start creates visible running/completed/failed UI states.

Responsive:

- Under 720px, layout remains usable like mobile.
- Over 1024px, no content is trapped in phone-width columns unless intentionally constrained, like chat transcript.
- Text does not overlap or clip in nav, token pill, composer, cards, or dialogs.

## Testing Checklist

Manual:

- Sign out/in through each auth option available in the environment.
- Complete onboarding with at least two different personas.
- Pair to local desktop with correct and incorrect code.
- Approve and deny pairing from desktop UI.
- Load projects, browse a folder, create a project.
- Start a chat, use `/help`, `/new`, `/open`, choose a model, change reasoning effort.
- Trigger low-credit or locked-model UI with a free account.
- Open billing and manage portal fallback.
- Open community detail, like, bookmark, comment, open app.
- Switch dark/light/auto if light mode is implemented.

Automated:

- Unit-test state reducers/helpers if the desktop implementation introduces them.
- Integration-test desktop bridge client for auth header, fallback URLs, timeout mapping, and error parsing.
- Component-test responsive shell breakpoints.
- Screenshot-test Dashboard, Projects, Chat empty state, Chat active state, Community, Profile, Billing, Auth, and Onboarding.

## Build Notes

- Prefer reusing current React Native Web components where practical.
- If using Electron/Tauri/native web shell, keep desktop bridge endpoint behavior compatible with `desktop/lib/routes.mjs`.
- Keep assets referenced from `src/assets/` or copy them with identical names into the desktop asset pipeline.
- Do not duplicate business rules for billing/model locks without referencing `src/screens/workspace/data/chatModels.ts` and profile billing types.
- Treat `Mobile App Desktop Recreation Spec.md` as the visual source and this file as the implementation source.
