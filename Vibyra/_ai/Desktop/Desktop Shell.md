# Desktop - Shell

Read this for `/desktop`, desktop visual work, static shell assets, auth gate, and launcher behavior.

## Files

- `desktop/app.html`
- `desktop/index.html`
- `desktop/assets/app.auth.css`
- `desktop/assets/app.auth.js`
- `desktop/assets/app.chat.js`
- `desktop/assets/app.1.js`
- `desktop/assets/app.2.js`
- `desktop/assets/app.1.css` through `desktop/assets/app.7.css`
- `desktop/lib/routes.mjs`
- `desktop/lib/desktopChat.mjs`
- repo-root `Vibyra Desktop` launcher

## Desktop Recreation

`Vibyra/_ai/Desktop App Implementation Spec.md` and `Vibyra/_ai/Mobile App Desktop Recreation Spec.md` are deep references only. Use them when recreating broad desktop screens, not for routine bridge/debug tasks.

`/desktop` serves `desktop/app.html`, a static Vibyra shell with a Chat-first layout, compact left rail, top bar, Projects, Builds, pairing modal, account/token modal, and responsive mobile dock. `desktop/index.html` remains the legacy bridge screen.

`desktop/lib/routes.mjs` serves mobile app imagery under `/app-assets/...` from `src/assets/` so the shell can reuse app assets.

The static shell must not invent account balances, profile identity, community posts, or project counts. Account/billing panels stay unavailable or phone-managed until a real desktop account API exists.

Wording is desktop-owned and phone-facing: connection status says `Connected to phone`, pairing chrome uses phone language, and project filters read `Desktop`/`Phone` instead of mobile-side `PC`.

## Auth Gate

`/desktop` loads a mobile-auth-style front screen before the shell. The local desktop session is visual-only and stored in `localStorage` under `vibyra.desktop.auth`; billing/token balances still require real mobile account data.

The desktop auth gate mirrors the mobile `AuthScreen` first page: `desktop/app.html` uses `/app-assets/front-auth.jpg`, `/app-assets/vibyra.png`, the same Beautiful/Fast/Code feature labels, real Google/Apple/email SVG marks, and hides the feature strip while the email form is expanded. Keep its layout rules in `desktop/assets/app.auth.css`: tall windows center the logo/title/actions as one stack with a slight downward nudge, short windows compact the logo/features/buttons and allow auth-screen scrolling, and auth provider labels should stay on one line.

The top-bar account pill opens the account modal. Its session section includes `Log out`, which calls `desktopSignOut()` in `desktop/assets/app.auth.js`, clears `/desktop/session/clear`, removes `vibyra.desktop.auth`, closes the account modal, and returns to the auth screen so the user can switch accounts.

## Chat, Builds, And Projects

The desktop shell defaults to `dashboard`/Builds after login. `desktop/assets/app.auth.js` sets `localStorage["vibyra.desktop.page"] = "dashboard"` for restored sessions and completed desktop email auth, and `desktop/assets/app.1.js` falls back to Builds when no stored page exists. Keep primary rail destinations to Chat, Projects, and Builds; keep profile/billing/account details in the account modal instead of rail tabs unless real desktop account APIs require a fuller page.

Chat should stay a calm desktop-chat surface: compact prompt chips, a restrained bottom composer, removable selected-project and attachment chips, local draft persistence in `vibyra.desktop.chatDraft`, and inline `activeAgentRun` status cards from real `/desktop/state`. Empty chat headlines rotate from `desktop/assets/app.chat-titles.js` using a 200+ conversational prompt pool keyed by day plus app-open count, with optional first-name and time-of-day personalization. The desktop chat model menu mirrors mobile `src/screens/workspace/data/chatModels.ts` model groups, uses matching provider logos for Claude/OpenAI/Gemini, and effort uses the mobile `low|medium|high|xhigh` values. Do not make the desktop shell start `/agents/start` directly without an intentional desktop-auth agent contract; that route remains phone-authenticated.

Desktop visual overrides should use the mobile dark palette from `src/styles/theme.ts`: `#07070A` background, `#12121A` surfaces, `#160D2A` tint, and `#6D3BFF`/`#8B5CFF` purple accents. Keep the palette restrained and clean; do not reintroduce glow-heavy dashboard styling or fake marketing panels.

Desktop chrome should feel like a modern AI desktop app: `desktop/assets/app.7.css` keeps the sidebar quiet with neutral selected rows, compact status/pairing card, and hover tooltips when the rail collapses. The topbar aligns with page gutters and keeps account/phone controls minimal: phone status is an unboxed phone icon with a green dot only when connected, and account is an unboxed Google-style avatar/initial button.

The desktop sidebar owns lightweight chat history, not profile identity: `desktop/app.html` includes `#rail-recents`, `desktop/assets/app.1.js` renders recent chat rows, and `desktop/assets/app.2.js` stores local desktop chat history in `localStorage["vibyra.desktop.recentChats"]` with the active id in `vibyra.desktop.activeChat`. Keep this as local shell history until a real desktop chat API exists. The rail stays expanded with recent chats down to roughly tablet width and collapses to nav tooltips at `max-width: 900px`. Do not add a top sidebar profile block; the account affordance belongs in the minimal topbar avatar.

The chat topbar is transparent desktop chrome: center the active chat title with the selected project path/directory beneath it, keep phone status as the small left icon, and use the right three-dot chat menu for local chat actions. `vibyra.desktop.recentChats` entries may include `pinned` and `archived`; pinned chats sort above other recents, archived chats stay in local storage but are hidden from the recent chat rail.

Sidebar tab and recent-chat selection state should not use a distinct selected color, background, border, or accent bar; keep selected rows visually neutral and rely on hover feedback only.

Desktop AI chat is desktop-owned and does not require phone pairing. `desktop/assets/app.chat.js` posts composer prompts to loopback-only `POST /desktop/chat`; `desktop/lib/desktopChat.mjs` requires the verified desktop account token from `/desktop/session`, gathers selected-project context with `promptProjectContext`, and proxies a `surface: "desktop"` payload to backend `/api/chat`. Keep `/agents/start` phone-authenticated until a separate desktop apply/discard approval UI exists. `GET /desktop/projects` is loopback-only and hydrates desktop project cards without a phone session.

Desktop chat should feel closer to a basic Codex terminal than the phone app. The visible desktop slash command set is local-only `/open`, `/new`, `/clear`, and `/help`, plus coding-oriented prompt skills `/plan`, `/debug`, `/review`, `/explain`, `/fix`, and `/refactor`. Do not expose mobile-style `/preview`, `/test`, `/build`, `/publish`, image generation, deep research, web search, or analyze-file tools from the desktop chat composer. Server-side `desktopChat.mjs` also allowlists desktop skills and normalizes every request to `mode: "chat"` so stale clients cannot send mobile/build modes.

Desktop chat paperclip is only for staging local context, currently Files and Folder rows. Do not include Camera, Photos, Create image, Deep research, Agent web search, Analyze files, or any separate top action grid on desktop. `desktop/assets/app.1.js` owns the action/skill lists and composer binding; `desktop/assets/app.2.js` owns selection/send helpers and local chat history; `desktop/lib/desktopChat.mjs` forwards only the allowlisted desktop skill, selected model, reasoning effort, history, attachments, project context, and `surface: "desktop"`.

Desktop backend API configuration is desktop-specific: route-side account/chat modules read `VIBYRA_DESKTOP_API_URL || VIBYRA_API_URL || http://127.0.0.1:8000`. Do not depend on Expo/mobile `EXPO_PUBLIC_API_URL` from desktop route modules.

Desktop membership mirrors backend/mobile billing contracts. `desktop/lib/desktopAccount.mjs` keeps plan, cycle, credits, caps, and `allowedModelTiers` from backend `/api/session`; `desktop/assets/app.auth.js` refreshes and stores those fields when `/desktop/session` returns `user`, including when the account modal opens, so model locks do not stay stale after checkout/portal changes. `desktop/assets/app.2.js` renders the account modal membership overview and uses the same model tier map as mobile so Free users can only select budget models while paid plans unlock all rows. Backend `/api/chat` remains the final enforcement layer.

The Builds page must use real `/desktop/state` data only. Show `activeAgentRun` as compact rows with duration and a three-dot action. Do not show fake project counts, fake event counts, fallback build rows, progress bars, token counts, percentages, or predicted completion.

Projects layout should match the full-width screenshot style: toolbar below top bar, three-card grid on wide screens, 176px cards, 16px padding, about 14px column gap and 16px row gap, active card with purple border.

## Diagnostics

If `/desktop` renders blank after shell edits, inspect Chrome console first. Known regression: `app.1.js` uses `icon()` from `app.2.js`; keep `app.2.js` loaded before `app.1.js`, then `app.auth.js`.

Launcher port checks should use `lsof -nP -tiTCP:${PORT} -sTCP:LISTEN`. If a non-Vibyra listener owns the port, print `ps -o pid=,cmd= -p "$PORT_PIDS"` and suggest `kill <pid>`.
