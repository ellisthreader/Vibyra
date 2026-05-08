# Vibyra App Memory

Scope: Expo React Native mobile app in `src/`.

## Mental Model

The app is the phone-side command center. It handles onboarding, pairing with Vibyra Desktop, project/file selection, chat prompts, live preview state, and cloud account sync.

## State Composition

`src/context/AppContext.tsx` is the main composition point. It creates `store` from `useAppState`, then wires:

- `useRequests`: desktop and backend request helpers.
- `useLogActions`: activity feed helpers.
- `useWorkspaceActions`: project/file/preview actions.
- `usePairingActions`: phone-to-desktop pairing flow.
- `useAgentActions`: prompt submission to desktop or backend chat.
- `useLiveSync`: desktop event polling.
- `useCloudSync`: remote account/app-state persistence. Debounced 700ms; passes `{ background: true }` to `appApiRequest` so it short-circuits before the fetch when the shared backend-offline gate is set. Still keeps a per-instance cooldown for the "Saved locally" warning (logged once per outage). The shared gate (`isBackendKnownOffline`, `markBackendOffline`, `markBackendOnline` in `src/utils/appApi.ts`) is set on any network/5xx failure, cleared on success, with a 60s cooldown. All background callers (cloud sync, skills fetch) check it; foreground/user-initiated requests bypass it so failures still surface.

## Prompt Flow

`src/context/useAgentActions.ts`:

- trims `state.taskText`;
- creates optimistic chat and agent records;
- adds prompt-money credit;
- if paired, sends `/agents/start` to the desktop bridge;
- otherwise sends `/api/chat` to the backend app;
- updates chat, files, changes, preview state, logs, and credits from the response.

For backend chat, the payload is trimmed for cost: a regex (`isBuildPrompt`) detects build intent. Non-build prompts skip `fileBody` entirely and send only the last 3 history messages capped at 600 chars each. Build prompts send 4 × 1200 chars and a 1200-char file slice. The same regex lives server-side in `ChatPrompting::isBuildPrompt`; keep them in sync. See `Vibyra Backend Memory.md` for `max_completion_tokens` and system prompt rules.

Slash-command skills are backend-driven. `AppProvider` fetches `GET /api/skills` once on mount and caches the list in `state.chatSkills` (type `ChatSkill[]` in `src/utils/appApi.ts`). The fetching `useEffect` depends on the stable `setChatSkills` setter (extracted from `setters` before the effect, since `setters` is a fresh object literal on every render of `useAppState` — depending on the whole `setters` object would re-fire the effect every render and spam `/api/skills` with `ERR_CONNECTION_REFUSED` when the backend is down). The chat composer (`src/screens/workspace/inline/chunk9.tsx`) shows a popover above the input when `taskText` matches `^/(\w*)$`, filtered by id/label/slash. Tapping a skill prefills the input with `<slash> ` so the user types the body. On send, `useAgentActions.startAgent` matches `^/(\w+)(?:\s+([\s\S]*))?$`, looks up the skill in `state.chatSkills`, sends only the body as `prompt`, and forwards `skill: <id>` in the `/api/chat` payload. Build-mode trimming (`fileBody`/`history` caps) keys off `skill.mode === "build"` when a skill is selected, otherwise falls back to the `isBuildPrompt` regex. Popover styles live in a local `skillMenuStyles` StyleSheet at the bottom of `chunk9.tsx`. Adding new skills is a backend-only change in `backend/config/skills.php` — the next app launch picks them up.

Assistant replies render with a typing animation. The shared helper `streamChatText` in `src/utils/chatStream.ts` tokenizes the full reply into word+whitespace chunks, drives 15–45ms randomized timeouts, and appends the `▍` cursor (`TYPING_CURSOR`) on every non-final partial. Three call sites use it: (1) `useAgentActions.streamAssistantMessage` for real AI replies from `/agents/start` and `/api/chat`; (2) `AppContext.addLocalChatReply` and `AppContext.addLocalChatProposal` for canned/local replies inside a project chat (e.g. "find folder X" results, "this is already the selected project", desktop-not-connected notices); (3) `useWorkspaceActions.addDetachedChatReply` for the detached-new-chat page where messages live in `state.newChatMessages` not `chatThreads`. All three insert the assistant message with text `TYPING_CURSOR` (or "Working on it..." for `useAgentActions`) and then stream into it by message id. New prompts cancel any in-flight stream via `streamingRef` in `useAgentActions`; local-reply streamers don't share a ref because each call targets a unique freshly-inserted message id. The full HTTP response still arrives in one shot — this is purely a render-side effect. Auto-scroll during growth is handled by `onContentSizeChange` on the chat ScrollView in `src/screens/workspace/inline/chunk9.tsx`. The `TypingIndicator` (animated three-dot) in `chunk23.tsx` shows only while `text === "Working on it..."` — once the first streamed chunk lands the indicator is replaced by `RichMessageText`.

Chat threads are scoped by project id in `src/context/useAppState.ts` (`chatThreads: Record<projectId, ChatMessage[]>`). The workspace chat page anchors its active chat id to `project-${selectedProject.id}` so starting or clearing a chat affects only the selected project.

Two independent state atoms drive chat rendering:

1. `selectedProjectId` (in `useAppState`) — drives `app.chatMessages = chatThreads[selectedProjectId]` and is the closure id used by `setChatMessages` writes from `useAgentActions`.
2. `selectedChatId` (in `src/screens/workspace/hooks/useWorkspaceState.ts`) — `null` for the detached "new chat" page, or `"project-<id>"` for a project's chat.

`visibleChatMessages` (renderer) **reads from `selectedChatId`**, not `selectedProjectId`: `app.chatThreads[selectedChatProjectId] ?? []` when a project chat is selected. This avoids a race during `createProjectAndOpenChat` where the two ids briefly disagree and the prior project's thread would otherwise leak through. The auto-snap effect (`src/screens/workspace/hooks/useWorkspaceActions.ts:36-40`) keeps `selectedChatId` aligned with `selectedProjectId` after commit, so agent writes (still keyed by `selectedProjectId`) land in the visible thread in steady state.

Agent/chat ownership contract: `app.startAgent(target?)`, `app.addLocalChatReply(..., target?)`, and `app.clearCurrentChat(projectId?)` can operate on an explicit project/chat target. Workspace flows that adopt/find a desktop folder should pass that target instead of relying on the current render's `selectedProjectId` closure. `useLiveSync` only mirrors `selectedProjectId` while an active desktop agent run reports the same project, so stale `/events` state should not yank the visible chat back to an older project.

Project creation (`src/context/useWorkspaceActions.ts::createProject` and `createLocalProject`) explicitly initializes `chatThreads[newId] = []` and seeds `chatTitles[newId]`. Without this, stale persisted entries or re-used ids could resurrect old conversations in freshly-made projects. Backend project ids come from `base64url(diskPath)` with `-2`/`-3` suffixes for collisions (`backend/app/Services/Concerns/ProjectFileState.php`), so true id collisions are rare — the init is defensive.

Project metadata for any chat-attached folder is persisted separately in `state.chatProjects: Record<id, Project>` so it survives desktop project-list refreshes and cold launches. `adoptProject`, `createProject`, and `createLocalProject` all upsert into `chatProjects`. `useCloudSync` includes `chatProjects` in its `appState` payload; on `applyRemoteUser` the restored map is merged back into `app.projects` (preserving the live discovery list, just adding adopted projects that the desktop hasn't auto-discovered). When the desktop responds with its discovered project list (after pairing or `createProject`), the mobile app uses `mergeProjects(current, incoming)` from `src/utils/files.ts` instead of replacing — so adopted-only entries are not wiped. `openProjectPreview` now checks whether the project id is in `app.projects` before calling `Linking.openURL` on the desktop preview route; if the project isn't known, it falls back to opening the chat directly. Without these guards, opening a previously-adopted chat after re-pair triggered the desktop's `/preview/project/{id}/{token}/` 404 ("Vibyra Desktop could not find that workspace anymore" preview shell from `backend/app/Services/Concerns/ProjectPreview.php`).

Desktop/project lookup prompts such as "find project X on my desktop" stay in the local desktop search flow. `useWorkspaceActions.onStartChat` (`src/screens/workspace/hooks/useWorkspaceActions.ts`) is the decision tree:

1. **Awaiting-name state**: if `awaitingFolderNameRef.current` is true (set on a previous turn when the user expressed find-folder intent without naming the folder), the next message is treated as the folder name. Prefix words like `yes/yeah/sure/please/its called/named` are stripped; "cancel" clears the state. Single-word answers like `test1` work directly.
2. **Current-project question** via `isCurrentProjectQuestion`: replies inline. Note: `open` was removed from the where-am-I trigger words to stop "open test1 folder" being misclassified.
3. **Find-folder intent without a name**: bot asks "what's the folder called?" and sets the awaiting ref.
4. **Find-folder intent with a name**: runs `runFolderSearch` (no connection → `desktopConnectionRequiredReply`; no matches → suggest the Projects tab; on top → "already selected"; lookup-only project chats → `addLocalChatProposal`; detached chats → `addDetachedChatProposal` so the visible chat shows a folder card with Open / Not now buttons; otherwise → modal `setFolderConfirm`).
5. **Greeting / small-talk** (detached only, ahead of the awaiting-name branch): `isGreeting` matches `hi/hello/hey/yo/sup/howdy/morning/afternoon/evening/gm/gn/good morning…`; `isSmallTalk` matches `thanks/ty/cheers/cool/nice/got it/sounds good/nvm…`. Replies come from `greetingReply()` and `smallTalkReply()`; both nudge toward `open folder <name>` or the Projects tab without sending anything to the agent.
6. **No find intent** in detached chat: if `bareNameCandidate(prompt)` is non-null (a single short token that looks like a folder name — no verb, no synonym noun), correction prefixes such as `no test1` search directly when connected; otherwise reply with `bareNameClarifyReply(name)` ("Did you mean a folder called `X`? Say `open folder X`…"). If there is no bare-name candidate, use `detachedFallbackReply()`. In a project chat: `app.startAgent(activeProjectTarget())`.

Detached folder proposals must be written to `newChatMessages`, not `app.chatThreads`; otherwise the typed prompt is cleared while the user sees no response because the proposal landed in a hidden project thread. `src/screens/workspace/hooks/useWorkspaceActions.ts` owns both `addDetachedChatReply` and `addDetachedChatProposal`.

Folder proposal cards (`src/screens/workspace/inline/chunk23.tsx`) expose Open folder / Not now / Wrong folder. Wrong folder appends a visible chat turn: user message "Wrong folder", then a Vibyra message with a `FolderRecovery` card offering Browse PC and Auto search PC. It also sets a short-lived recovery ref in `useWorkspaceActions`, so the next typed correction (e.g. `no test1`) is treated as a replacement folder search instead of a generic detached chat prompt. Auto search retries the saved query while excluding the rejected folder, but appends a fresh result/reply below the recovery card instead of mutating the original proposal. Browse PC opens the full-screen `FolderBrowserModal` in `src/screens/workspace/inline/chunk9.tsx`, backed by `app.browseDesktopPath`; it shows PC roots/files/folders, lets users drill into folders, and selects a folder via `acceptFolderProposal`. `FolderProposal` carries optional `query` and `error`; `FolderRecovery` carries the proposal id, retry query, and excluded project id.

`useWorkspaceActions.onStartChat` uses `submitLockRef` to dedupe local chat submits, including desktop folder searches that do not set `agentRequesting`; without the lock, a duplicate native press or rapid double tap can reuse the stale `taskText` closure and append the same prompt/proposal twice.

Folder-name extraction is consolidated in `extractFolderName(prompt)` in `src/screens/workspace/helpers/chatPrompts.ts`. It returns `null` on uncertainty (rather than leaking junk like the entire prompt or an empty string), so the search never fires with a meaningless query. `desktopProjectSearchQuery` is now a thin wrapper. `isFindFolderIntent` is a separate helper used by both `isProjectLookupOnly` and the decision tree. The verb set (`FIND_VERBS`) covers `find|open|locate|use|switch|select|go|work on/in|connect|attach|load|pick|choose|show|view|get|grab|link|hook up|set up|pull up|bring up|jump to|head to`; the noun set (`TARGET_NOUN` = `FOLDER_NOUN | FILE_NOUN`) covers `folder|repo|project|directory|dir|app|codebase|workspace|desktop|pc|computer|machine|src|source|file|files|path` and common typos (`fodler|foler|floder|projct|projet|fiel|diretory|directry`). A `FILLER_PREFIX` regex strips chained leading filler (`yes/no/ok/please/hi/yeah/nope/um/well/just/actually…`) before extraction. Candidate cleanup rejects filler/pronoun/article-only captures like `"me a"` from `"open me a folder pls"`, while named corrections like `"no not this one its called test1"` still extract `test1`. Detached correction prefixes (`no/not/nope/nah <name>`) now search directly when connected, instead of asking the user to say `open folder <name>` again. `isFindFolderIntent` returns true when (a) verb + noun, OR (b) noun + quoted/`called`-named, OR (c) verb + quoted/`called`-named — quoted/named intents do **not** require a verb when a candidate can be extracted. Extractor passes are ordered: quoted → `called/named X` → `<verb> <noun> NAME` → `<verb> NAME <noun>` → `<noun> NAME` → trailing `NAME <noun>` → bare `<verb> NAME` (after filler-strip). The early `<verb> <noun> NAME` pass is what stops `"yes open folder claudetest"` from extracting `"yes open"` via the trailing-noun fallback.

If a prompt references local desktop folders/projects while Vibyra Desktop is not connected, the mobile app should answer locally with a pairing/connection instruction. Do not send that prompt to backend/cloud chat, because cloud chat cannot access local files.

Opening AI Chat from the bottom nav or dashboard is a detached new chat and must not show the last selected project thread. Project chat context should appear only after explicitly opening/selecting a folder/project.

Chat should never show raw transport/provider errors like `HTTP 401`, `502 Bad Gateway`, or `Failed to fetch` as the assistant reply. `useAgentActions.ts` maps desktop/backend failures to user-facing recovery text, while preserving the raw message in logs.

Paired desktop agent runs use OpenRouter via `OPENROUTER_API_KEY`; they should not require `OPENAI_API_KEY`. The desktop backend maps Vibyra model keys to OpenRouter model ids before sending the agent request.

## Pairing Flow

`src/context/usePairingActions.ts`:

- scans Wi-Fi candidates for a matching desktop pair code;
- posts `/pair`;
- waits on `/pair/status`;
- stores `{ url, token, machineName }` as `connection`;
- loads desktop projects and first project files after approval.
- persists the desktop bearer token locally in remembered desktops for fast reconnect, but `useCloudSync` strips that token before sending remembered desktops to the cloud API.

Supporting files:

- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/context/pairingHelpers.ts`
- `src/utils/network.ts`

## Workspace Flow

`src/context/useWorkspaceActions.ts` selects projects/files, starts previews, and calls desktop file/project routes when a connection exists.

Desktop bridge now exposes the workspace routes this hook expects: `GET /desktop/folders`, `GET /desktop/search?q=...`, `GET /desktop/browse?path=...`, `GET /files?projectId=...`, `GET /files/read?projectId=...&path=...`, `POST /files/create`, and `POST /projects/create`. The desktop implementation lives in `desktop/lib/files.mjs`, `desktop/lib/projects.mjs`, and `desktop/lib/routes.mjs`; file paths are constrained to the selected project and generated/heavy folders are skipped from listing. `/desktop/browse` powers the mobile manual folder picker and returns roots when `path` is omitted, otherwise the current folder, parent path, and visible child file/folder entries.

## UI Entry Points

- `App.tsx`: top-level app entry.
- `src/screens/WorkspaceScreen.tsx`: main workspace experience.
- `src/screens/OnboardingScreen.tsx`: onboarding orchestration.
- `src/components/`: reusable UI panels and controls.
- `src/styles/theme.ts`: shared colors, spacing, and typography tokens.

## Membership / Billing UI

Two payment paths converge on the same backend:

- **Mobile (IAP)** — `src/screens/onboarding/steps/usePricingPurchase.ts` drives `expo-iap` requestPurchase against the `app.vibyra.membership.{plan}.{cycle}` SKUs from `src/screens/onboarding/data/plans.ts`. On `onPurchaseSuccess` it now first POSTs the receipt to the backend via `reportIapReceipt(authToken, { platform, productId, transactionId, receipt })` (helper in `src/utils/billingApi.ts`), waits for the server to update the user, then calls `app.applyRemoteUserFromIap(result.user)` to sync local state, **then** runs `finishTransaction`. If the receipt POST fails the IAP call is aborted with a user-facing error so we don't lose track of paid-but-unrecorded purchases. `purchase.purchaseToken` is the iOS JWS or Android purchase token; `Platform.OS === "ios"` → `apple` else `google`.
- **Web/Desktop (Stripe)** — `src/screens/workspace/inline/profile/BillingSheet.tsx` calls `startStripeCheckout(authToken, { kind: "subscription", plan, cycle })` (defaults to `"annual"` per the spec's recommended display) and opens the returned URL via `Linking.openURL`. "Manage payment & invoices" calls `openBillingPortal(authToken)` and falls back to `https://vibyra.app/billing/manage` if the user has no Stripe customer yet.

Plan ladder + features in `src/screens/workspace/inline/profile/types.ts::PLAN_TIERS` (Free £0 / Starter £19 / Builder £49 / Pro £99) mirror `backend/config/billing.php`. The onboarding pricing screen uses a separate dataset in `src/screens/onboarding/data/plans.ts` — keep both in sync if prices/credits change.

Model gating: `src/screens/workspace/data/chatModels.ts` is the source of truth for tier mapping (`modelTiers`: model key → `free|budget|balanced|premium`) and per-plan allowed tiers (`planAllowedTiers`). `chunk10.tsx::isModelLockedForPlan(model, accountPlan, allowedTiers?)` calls `modelLockedForTiers` — prefer `allowedTiers` from `RemoteUser.allowedModelTiers` (returned by the backend's `userPayload`) since it survives backend changes without a frontend redeploy. The lock pill label is computed by `modelLockReason(model)` and reads `Builder+` for premium-tier models, `Starter+` for balanced, `Locked` otherwise. Don't add new ad-hoc lock checks based on the `model.locked` boolean — that property is now ignored; remove it from data if you reach for it. Backend also enforces tier in `/api/chat` (`403 { requiredTier, plan }`) so a stale client cannot bypass gating.

Error copy: `src/context/agentErrors.ts` translates the new chat error messages — "not enough credits", "daily AI usage cap", "plan does not include this model" — into friendly text that nudges the user to Account → Billing instead of dumping the raw HTTP body.

## Profile Tab

The Profile tab lives in `src/screens/workspace/inline/profile/` — one component per file, every file under 200 lines. `chunk18.tsx` is now a one-line re-export of that folder. `ProfilePage.tsx` only takes `{ activeTab, onTabChange }`; everything else (name, email, plan, credits, projects, signOut, updateProfile) is read from `useAppContext()` directly inside each sheet. Sheet visibility + toggle/appearance/language local state is owned by `useProfileSheets()` (returned as `ProfileSheets`) and passed to the prefs sheets that share it. `types.ts` holds `SheetKind`, `PlanKey`, `PlanTier`, `PLAN_TIERS`, `LANGUAGES`, `APPEARANCE_OPTIONS`, `FAQS`, `PROFILE_ROW_TO_SHEET`, plus helpers `tierCompare`, `nextRecommendedTier`, `buildReferralCode`, `appearanceLabel`. Shared UI primitives: `ProfileSheet` (modal shell), `ToggleRow`, `PlanCard`, `ProfileHero`. Sheet files: `EditProfileSheet`, `BillingSheet`, `UsageSheet`, `ReferSheet`, `NotificationsSheet`, `AppearanceSheet`, `SecuritySheet`, `LanguageSheet`, `HelpSheet`, `SupportSheet`, `TermsSheet`, `LogoutSheet`. Every settings row, the avatar pencil button, and the plan badge are wired to bottom-sheet modals. Billing & subscription has its **own** dedicated upsell sheet (`profile/BillingSheet.tsx`) — distinct from the global `TokenMembershipSheet`. It renders a compact animated hero, then four generated-image-backed plan cards (Free / Starter / Builder / Pro from `profile/types.ts::PLAN_TIERS`) in a two-by-two grid so all membership options are visible without scrolling on normal phone sheets. Card artwork lives in `src/assets/billing-plans/` and is exported as `billingPlanArt` from `src/screens/workspace/data/assets.ts`; `profile/PlanCard.tsx` handles per-card fade/slide-in and press-scale animations. The next tier above the user's `accountPlan` is highlighted with a pink "Recommended" ribbon and gradient CTA; current plan shows a green "Current" chip. Upgrade taps deep-link to `https://vibyra.app/billing/upgrade?plan=<key>` via `Linking`; "Manage payment & invoices" goes to `/billing/manage`. The `onOpenBilling` prop on ProfilePage is still passed by `WorkspaceScreen` but is **only** used as a fallback inside the new sheet — the membership token sheet is now reachable solely via the header tokens button + the chat low-credit nudge, not from Profile.

`AppContext` exposes two new actions consumed by ProfilePage: `signOut()` (clears auth + session-scoped state: token, accountId, password, onboarding, chats, projects, agents, logs, files, changes, connection, remembered desktops) and `updateProfile({ name, email, machineName })` (updates local setters and POSTs to `/api/account/profile` when a token exists; logs a warning on failure via `useLogActions`). Both are part of `AppActions` in `src/context/appContextTypes.ts`. Toggle/appearance/language state inside ProfilePage is local-only — wire it to persistence/AppState before claiming it survives reloads.

## Bottom Nav Tabs

The five tabs are configured in `src/screens/workspace/data/pages.ts` (`pages` array): `dashboard` (Home), `projects`, `chat` (AI Chat), `community`, `profile`. Each maps to a top-level page component exported from `src/screens/workspace/inline/index.ts` (`DashboardHome` chunk6, `ProjectsPage` chunk8, `AIChatPage` chunk9-ish, `CommunityPage` chunk12, `ProfilePage` chunk18). `BottomNav` lives in chunk1 and renders by reading `pages`.

## Token Hints

For mobile tasks, start with this note plus `AppContext.tsx` and the one relevant hook. Avoid opening all screen/style parts unless the task is visual.
