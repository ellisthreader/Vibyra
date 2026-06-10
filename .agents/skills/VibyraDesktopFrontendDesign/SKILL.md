---
name: VibyraDesktopFrontendDesign
description: Apply Vibyra desktop app frontend design rules. Use when changing, reviewing, or proposing UI for the Vibyra desktop shell, especially the welcome/auth screen, top bar, sidebar, dashboard, chat surface, light/dark theme switching, modals, terminal surfaces, responsive layout, Vibyra logo, profile/avatar, phone connection indicators, recent chats, or desktop visual polish.
metadata:
  short-description: Vibyra desktop frontend design rules
---

# VibyraDesktopFrontendDesign

Use this skill for `/desktop` frontend work. It captures the Vibyra desktop visual direction learned from product feedback.

## First Steps

1. Follow repo memory protocol first.
2. Read `Vibyra/_ai/Vibyra Desktop Memory.md`.
3. Read `Vibyra/_ai/Desktop/Desktop Shell.md`.
4. For broad product/frontend direction, read `Vibyra/_ai/App/Short-Form Frontend Design Principles.md`.
5. Inspect the smallest relevant source set, usually:
   - `desktop/app.html`
   - `desktop/assets/app.1.js`
   - `desktop/assets/app.2.js`
   - `desktop/assets/app.7.css`
   - `desktop/assets/app.auth.css`
   - `desktop/assets/app.auth.js`

## Design Direction

Vibyra desktop should feel like a simple, dark, mobile-inspired AI desktop app, not a heavy admin dashboard.

- Use the mobile app as the visual source of truth.
- Design the first visible action so it can be understood in a silent 15-second product clip.
- Preserve one core value proposition per screen; add secondary controls only when they support the active workflow.
- Prefer UX shapes that make the job visually obvious over defaulting every AI surface to a generic chatbot.
- Make Vibyra feel distinct through real workflow interaction, project/build state, and mobile identity, not decorative glow, fake metrics, or feature clutter.
- Prefer fewer boxes, fewer labels, fewer pills, and fewer explanatory captions.
- Keep controls familiar and quiet: icon buttons, simple avatars, concise nav rows.
- Use the restrained mobile palette: `#07070A`, `#12121A`, `#160D2A`, `#6D3BFF`, `#8B5CFF`.
- Keep card radius modest, usually `8px` or less unless the existing shell pattern says otherwise.
- Avoid glow-heavy, marketing-heavy, or decorative dashboard styling.
- When a sidebar has a strong secondary palette worth preserving, keep its
  canvas and navigation semantic/neutral and limit that palette to roughly
  10% of the surface through a faint atmosphere, edge, avatar, or contextual
  accent. Selected navigation remains neutral rather than becoming a full
  accent fill.

## Image-Led Product Cards

Use the successful Settings Billing cards as the reference when a Vibyra
surface needs product appeal without losing desktop clarity.

- Start with the simple information hierarchy: identity, name, audience, price,
  concise benefits, then one action.
- Reuse strong existing artwork before generating replacements. Prefer images
  with dark negative space and a clear subject placed away from primary copy.
- Put artwork behind the card as a restrained layer, not as a separate banner.
  Fade it into the semantic card background before dense text begins.
- Keep a small recognizable icon in the foreground even when the full artwork
  is present. It improves quick plan recognition and preserves visual identity.
- Use color to distinguish tiers through artwork, checks, borders, and one
  featured action. Do not tint every surface or add decorative glow.
- Keep cards equal in structure and height. Highlight only the recommended
  option with a thin accent border and one short badge centered across the top
  border, outside the clipped artwork so it does not cover the image.
- Protect readability in both themes with semantic surface gradients and
  theme-specific artwork opacity rather than hardcoded opaque overlays.
- Verify the final crop in a real Chromium render at the target desktop width.
  Regenerate artwork only when cropping, contrast, or subject placement cannot
  be corrected cleanly with layout.

## TikTok-Style Appeal

Judge every screen the way a TikTok viewer judges a clip: instantly, without explanation, in the first second.

- The first screen/action must make someone think "What is this? I want to try it." before they read anything.
- Communicate the core value in seconds through the visuals alone, not through copy or a walkthrough.
- Feel distinctive on sight; never look like another generic AI/chat/dashboard app.
- Build each screen around a shareable moment or obvious outcome worth recording.
- Do not let secondary features dilute the main visual hook.
- Make the app look good in a short, fast screen recording, not only when someone slowly explores it.
- Vibyra's demoable moments to keep crisp and satisfying: pairing phone to desktop, sending an AI build prompt, watching a project/build run, applying changes, and opening a preview.

## Auth Welcome Screen

- Match the mobile first welcome page.
- Use `/app-assets/front-auth.jpg` and `/app-assets/vibyra.png`.
- Treat `src/assets/vibyra.png` as the canonical shared UI brand mark used by
  mobile and desktop. Never replace it to satisfy App Store or Play Store icon
  requirements; create a separate opaque square store-icon asset instead.
- The desktop auth session is visual-only local shell state stored in `localStorage["vibyra.desktop.auth"]`; do not imply real billing/account balance unless a desktop account API exists.
- Keep the same first-page feature labels as mobile: Beautiful, Fast, Code.
- Hide the feature strip while the email form is expanded.
- Keep the Vibyra logo visible and unclipped: use `object-fit: contain`, avoid negative offsets, and avoid hidden overflow around the logo.
- Provider buttons must stay on one line: `Continue with Google`, `Continue with Apple`, `Continue with email`.
- Use real provider marks/SVGs, not placeholder letters.
- Do not add quizzes, onboarding flows, or connect pages. After login, go straight to Home through the compatibility `dashboard` route key.
- The account modal owns session controls; `Log out` should clear the local desktop session and return to the auth screen.

## Top Bar

Keep it extremely simple.

- Phone status: show only a phone icon, plus a small green dot when connected.
- Do not show a bordered connection pill with repeated text.
- Profile: show only a Google-style avatar/image or first initial.
- Do not show `Desktop session`, plan text, email text, or a boxed account chip in the top bar.
- Controls should be unboxed by default; use hover feedback only.

## Terminal Live Preview

- Keep Live Preview in the same resizable right workspace as Editor, AI, and
  Memory. Use one compact Editor / Preview / AI / Memory switcher
  and keep the terminal canvas mounted and visible on the left.
- Project inspection must never start a dev server. Detect runnable apps first,
  show every supported target plus visible unsupported native targets, and
  require an explicit in-panel Run action that names the app and exact command.
  Do not use an automatic launch or a browser-native confirm dialog.
- Monorepo detection should be bounded and skip generated/private directories.
  When multiple apps exist, keep one selected target in the empty state and add
  a compact app selector to the Preview toolbar after launch. The start route
  must revalidate the detected target ID before spawning any process.
- Opening Preview must immediately derive the project from the active terminal,
  active terminal project group, setup selection, or selected desktop project
  and run read-only inspection. Re-run inspection when the active terminal or
  companion project context changes; never rely on a separate legacy Preview
  launcher to initialize the project ID.
- Auto-detection is not permission to execute. Only the explicit Run action may
  start the selected target. After approval, use the selected device frame as a
  truthful startup surface: show the exact command and live bounded stdout/
  stderr until readiness verification succeeds, then replace it with the real
  app. Do not use fake timed startup messages when process output is available.
- Keep detected app cards neutral. Reserve the purple border and tint for the
  selected app, and scope primary button styles so they never recolor every
  detected target.
- Let detected apps run concurrently, but keep one selected device frame. Show
  compact per-app Starting/Running state and reuse one contextual Run, View, or
  Stop action instead of adding preview tabs, duplicate frames, or a services
  dashboard. Every new process still requires explicit approval.
- Persist Preview device state per project target. Switching between running
  apps must restore that app's preset, orientation, zoom, and custom dimensions
  before displaying it, so a mobile target can remain on an iPhone while a
  desktop target remains on a laptop preset.
- Preview controls belong at the top of the right workspace, not in the main
  desktop top navigation. Keep the normal terminal dock, phone, Vibyra AI, and
  profile actions stable while Preview is open.
- Preview is reached only from the right workspace switcher. Do not add a Test
  or Preview launcher to the terminal dock or project quick actions. Switching
  to AI or Memory keeps the workspace open and replaces only its
  content. Closing the workspace returns focus to the active terminal.
- Treat the preset and rotate action as one control group. Put rotate directly
  beside the device selector and use a dedicated device-orientation icon, not a
  split-pane or generic layout icon.
- Keep zoom out, fit percentage, and zoom in as one compact group in the
  Preview toolbar. The canvas should contain only the preview frame and its
  in-frame loading state.
- Keep the workspace resizable on normal desktop widths while preserving at
  least 480px for the terminal. At narrow widths, overlay it from the right
  instead of compressing the terminal into an unusable column.

## Terminal Surfaces

- Treat the right workspace switcher, editor file tabs, and active-file toolbar
  as one connected header system. Use one neutral chrome family, one divider
  color, and only a thin accent indicator for active modes/files; avoid stacked
  black, purple, and gray bars or a large purple selected-mode block.
- Keep the Editor Explorer path header text-only apart from its folder icon.
  Do not add an always-visible refresh action beside it where open file tabs
  can overlap; retain Retry only inside the file-tree error state.
- Keep one terminal dock and one terminal stage. Do not add a separate project
  navigation row above the panes. Keep compact project rows beneath
  `Terminals` in the expanded left rail only while that project owns at least
  one authoritative terminal. Recovered terminals keep their project row
  across app restarts; removing the final terminal removes the row. Show
  framework, terminal count, and truthful `Working`, `Ready`,
  `Needs attention`, or `Stopped` state. Selecting a project scopes the
  existing dock and stage without unmounting other PTYs;
  an empty project shows a focused launchpad in the terminal stage.
- Keep one quiet `+` action beside the expanded left-rail `Terminals` label.
  It opens the project-workspace setup for an existing local project and offers
  Cancel. Every setup starts on a dedicated, sparse `Solo` or `Team` choice
  screen using two spacious, flat side-by-side choices with one semantic icon,
  one line of supporting copy, and no individual card surfaces, illustrations,
  decorative gradients, dividers, or nested containers. Give each choice a
  large free-standing icon, strong centered title, concise copy, and generous
  whitespace. Solo copy explains focused builds, fixes, and quick changes;
  Team copy explains larger work split across multiple agents. Do not add
  directional arrows. Use only short entrance and hover motion, all disabled under
  `prefers-reduced-motion`. Show one progress rail across the flow:
  `Workspace`, `Setup`, `Terminals`; render it once on the setup page, centered
  above and outside the setup card. Never place it in the terminal topbar.
  Present it as a quiet horizontal stepper with evenly centered nodes, labels
  beneath each node, one continuous connector, and a restrained active ring.
  Hide the entire progress rail after launch so the terminal dock keeps its
  compact navigation. Setup combines counts
  `1–12`, a live preview
  driven by the same grid rules as the real terminal stage, project, model,
  workspace safety, reasoning, and token source. Keep reasoning effort visible
  in the main form, while token/account settings live in a collapsed
  `Advanced options` disclosure. Explain its two payment choices without
  provider implementation details: Vibyra tokens use Vibyra credits; My AI
  accounts use the user's connected account and its billing. Do not show an
  initial-goal textarea, repeat
  the selected mode, or add a second setup title. The completed `Workspace`
  step is the Back control. Team retains Safe
  mode as the default. Setup must not create filesystem projects or launch
  sessions immediately, and it disables at the global terminal limit. Within
  setup, the project selector must use the same neutral field surface, border,
  and hover treatment as the model selector.
- Keep PTY/xterm terminals edge-to-edge in both focus and grid layouts. Do not
  add wrapper padding around `.terminal-xterm`; native provider TUIs own their
  internal spacing.
- Give each newly launched terminal a short common human name and persist it as
  the authoritative terminal title. Pane headers show that name plus the agent
  identity, followed by quiet full-screen, details, and close controls.
- Full-screen is per terminal and must hide sibling panes without unmounting
  their xterm sessions. Keep explicit close confirmation for running or
  contextual terminals, and preserve Safe mode as the recommended multi-agent
  workspace default.
- Make the selected terminal unmistakable with a crisp inset edge and quiet
  header emphasis in that terminal's provider accent. Avoid glow, layout
  movement, thick cards, or styling that obscures the native TUI.
- Selection must follow the terminal receiving pointer or keyboard input, not
  only terminal-tab or pane-header clicks. Update the active pane styling
  without remounting its xterm session.
- Treat Editor as a mode of the existing resizable right workspace, not a
  separate terminal page or a second competing sidebar. Terminal file links
  open a VS Code-inspired workbench with a compact explorer, top file tabs,
  one code surface, dirty-line markers, explicit Save/Revert actions, and a
  quiet status bar. Keep the terminal visible on wide windows and let Editor
  take the full content width on narrow windows.
- Use the locally served `monaco-editor` runtime for the code surface; a styled
  textarea is not an acceptable substitute. Preserve per-file Monaco models
  across companion remounts so syntax highlighting, minimap, line numbers,
  bracket/indent guides, find, selection, undo history, and `Ctrl/Cmd+S`
  behave like VS Code without remounting xterm.
- Opening Editor must immediately load and display the active terminal
  workspace tree; do not wait for a file hyperlink click. The Explorer follows
  active terminal changes, shows normal project files, assets, and dotfiles,
  and keeps generated folders such as `.git`, `node_modules`, build output, and
  vendor trees excluded.
- Start Explorer folders collapsed so large projects remain scannable. Editor
  must use the normal companion default width and persisted splitter width; do
  not add mode-specific percentage columns that force the workspace wider.
- Keep the Editor file sidebar context to one compact directory-path header.
  Do not repeat an `Explorer` label, AI terminal name, branch, or separate
  workspace subtitle above the tree.
- File links must come from xterm's link-provider API so terminal bytes and
  native provider TUI output remain unchanged. Opening or closing Editor must
  patch beside `.terminal-stage` without remounting any xterm session.
- Grid panes must touch with no stage gap, rounded card corners, or outer tile
  borders. Terminal headers may retain their internal divider.
- Keep common terminal counts visually balanced: six terminals use a `3 x 2`
  grid instead of `4 + 2`. Grid tiles and PTY hosts must use paint containment
  and hidden overflow so a native TUI can never draw across an adjacent header.
- Keep the xterm viewport full height, but do not force `.xterm-screen` to
  `height: 100%`. Xterm must retain its calculated row height so native
  composer and status rows remain anchored at the bottom of the terminal.
- After xterm mounts, derive rows and columns from its rendered CSS cell
  dimensions and viewport client size. Font-size estimates can over-allocate a
  row and clip a native composer into the next grid track.
- Codex's main chat uses an inline viewport even when alternate-screen mode is
  enabled; alternate screen is reserved for overlays and pickers. Keep the
  worker startup cursor-probe response bottom-anchored so the native composer
  and status line occupy the terminal's final rows before xterm subscribes.

## Project Memory

- An empty Memory workspace should immediately look for local Obsidian vaults
  and show simple one-click suggestions with name, friendly location, and note
  count. Center this setup state in the available right workspace rather than
  pinning it to the top. Never expose absolute local paths.
- Keep exactly two clear manual ingestion choices: `Obsidian vault` for folder
  structure and linked notes, and `Markdown files` for individual `.md`,
  `.markdown`, or `.txt` notes. Populated compact and fullscreen views reuse
  those choices inside one quiet `Import` menu.
- Keep discovery and imports local-first and restrained. Do not add AI-generated
  memory, starter vaults, fake notes, or extra onboarding steps. Obsidian's
  registry is the fast discovery path; use only a shallow bounded fallback scan
  when the registry has no vaults.
- After import, do not reserve a bottom footer merely for `Imported N notes` or
  the note count. Put brief status in the toolbar and give the graph/editor the
  full remaining height.
- Keep the Memory graph and Notes workbench footer-free and stretched through
  the complete content row. Put the graph legend beside its top controls rather
  than reserving bottom space.
- Do not cap the Memory companion with `vh` sizing at narrow widths. Its entire
  parent chain must remain full-height so Graph and Notes reach the bottom edge.
- The Memory companion has exactly two flow children: the mode navigation and
  `.terminal-companion-primary`. Keep its grid at `auto minmax(0, 1fr)`.
  Inside Notes, let grid tracks provide height; use `min-height: 0` and keep
  scrolling on the textarea/preview instead of chaining nested `height: 100%`.
  Fullscreen Memory must keep `.terminal-companion-primary` visible because it
  owns the current fullscreen renderer.
- The graph's virtual layout must follow the rendered canvas aspect ratio. A
  fixed landscape viewBox in the tall right sidebar leaves a large visual gap
  even when the DOM is technically full-height. In the compact portrait
  sidebar, keep the entire Graph section top-aligned at 60% of the available
  content height so it remains readable instead of vertically stretched. Notes
  and fullscreen Graph remain full-height.

## Pair Phone Modal

- Keep pairing as four exclusive states: waiting, desktop approval, phone
  confirmation, and connected. Never stack a device approval card beneath the
  waiting instructions.
- Waiting should lead with one scannable QR, a compact phone-to-desktop
  code-native illustration, three short steps, and the manual pair code as a
  quiet fallback. Do not add video, a carousel, or decorative screenshots.
- QR pairing may encode only `vibyra://pair?code=...&url=...`. Never place a
  bearer token, account identity, email, or automatic approval in the QR.
  Desktop approval remains mandatory before credentials are returned.
- Approval replaces the waiting UI and focuses on device name, one security
  warning, and clear `Deny` / `Pair phone` actions. After desktop approval, the
  `approved` request must show a focused waiting-for-phone-confirmation state;
  never fall back to the QR or pair code while the phone is confirming
  permission. Connected state shows the device and a quiet disconnect action.
- Make the connected transition feel complete with a short, one-shot success
  animation that settles into a static state. Never loop celebration effects,
  and provide an immediate static result under `prefers-reduced-motion`.
- Keep the panel around 590px or narrower, stack cleanly on narrow windows,
  support light/dark themes, and disable decorative motion under
  `prefers-reduced-motion`.

## Settings Performance

- Keep the open Settings modal DOM-stable across the one-second desktop state
  refresh. Background shell state must not call `renderProfileModal()`.
- Scope profile queries and event binding to `#profile-modal-body`; do not scan
  the whole document after each section render.
- Patch ordinary preference controls in place. Full modal rerenders are for
  section changes and appearance/theme changes, not voice speed, voice choice,
  language, font, notifications, or privacy toggles.
- Do not use `backdrop-filter` on the Settings backdrop. Vibyra's Linux
  Electron launch disables GPU compositing, making live blur over terminals
  expensive and visibly laggy.

## Account Settings

- Present `Signed-in devices` as one compact semantic table with `Device`,
  `Type`, `Location`, and `Last active` columns plus a quiet actions menu.
- Use only real grouped device data from `/api/account/sessions`, keep the
  current device first, and retain the `Current` marker and device revocation.
- Preserve the real device label supplied by the app. Mobile auth, pairing, and
  `POST /api/account/session/device` must share one native-derived label so the
  pairing modal and Settings table agree; allow platform fallbacks when the OS
  does not expose a user-customized phone name.
- Keep location copy compact (`London, UK`) and show the real IP address as
  muted secondary text beneath it. Do not repeat the IP when location lookup
  has already fallen back to that same address.
- A raw public IP in Location means the backend MaxMind city database is
  unavailable. Do not guess a city or call a hosted geolocation service from
  the desktop UI; configure `MAXMIND_ACCOUNT_ID` plus
  `MAXMIND_LICENSE_KEY` and run
  `php artisan maxmind:update`.
- On narrow windows, collapse each table row into labeled details instead of
  forcing horizontal scrolling. Do not add created dates, session counts,
  summary cards, or a separate current-device panel.

## Billing Settings

- Keep Billing as a flat one-glance surface for the current plan, backend-owned
  price, next credit refresh, monthly usage, and 5-hour/weekly percentages.
- Free accounts get one `Upgrade plan` action. Stripe accounts with a customer
  get one `Manage payment & invoices` action that opens Customer Portal.
- Apple and Google subscriptions link to their provider's subscription
  management. Manual test memberships may show concise test payment/invoice
  values without an explanatory warning paragraph; unknown providers use
  billing support instead of a broken portal.
- Inside expanded management, keep `Change membership` and `End membership` as
  small unboxed footer actions beneath billing details. Keep the cancellation
  questionnaire hidden until `End membership` is selected. Require one reason,
  optional detail, and explicit confirmation before submission.
- Record cancellation feedback before acting. Manual test memberships schedule
  cancellation at `membershipEndsAt` and retain paid access until then; they
  must not downgrade immediately. Stripe and app-store memberships continue
  through their secure provider instead of claiming an external cancellation
  occurred.
- Keep paid billing management only inside the Settings Billing section; do not
  duplicate `Manage billing` in the topbar account dropdown.
- `Upgrade plan` and `Change membership` must replace the Billing detail pane
  inside the existing Settings modal. Do not stack `#token-modal` over Settings.
  Use three calm paid-plan columns with small existing plan artwork, one concise
  feature list and CTA per plan, and `Most popular` only on Builder.
- The profile-dropdown `Upgrade plan` modal and non-Settings upgrade prompts
  must use the same shared three-card renderer. Do not retain a separate large
  hero plus quiet-row plan design for those entry points. These direct upgrade
  modals have no Back action; users close them with the standard modal close.
- Use each matching `billing-plans/<tier>-card.png` as a restrained background
  layer behind its Settings plan card. Preserve the small plan icon, fade the
  artwork into the semantic card surface before pricing/features, and verify
  the crop in Chromium rather than replacing strong existing assets.
- Treat plan plus billing cycle as the current selection. Load numeric prices,
  credits, project limits, and agent limits from `/api/billing/plans`, while
  retaining local marketing copy and artwork as the offline fallback.
- Paid provider CTAs must describe the real handoff (`Manage with Stripe`,
  Apple, or Google Play); manual memberships may switch directly. Refresh the
  desktop account when focus returns from external billing.
- Keep payment details, invoices, provider actions, and cancellation hidden by
  default. Show one `Manage membership` row and reveal one compact management
  panel only after the user clicks it.
- In Electron, open HTTPS and mail links with the system browser through
  `setWindowOpenHandler`/`shell.openExternal`. Do not create an `about:blank`
  child `BrowserWindow` while waiting for billing API responses.
- Paid plan selection uses `POST /api/billing/change`, never subscription
  Checkout. Manual memberships update locally; Stripe opens Customer Portal;
  Apple and Google open their subscription settings.
- The management panel may use one short reveal animation. Keep it under about
  200ms and disable it under `prefers-reduced-motion`.

## Sidebar

The sidebar should feel like the mobile app’s AI/chat navigation.

- Keep the Vibyra logo at the top.
- Keep the rail on the same semantic background as the main shell; use its subtle border and row states for separation instead of an elevated contrasting fill.
- Do not show a profile card/block at the top of the sidebar.
- Primary nav should stay simple: Home, Chat, Terminals, Projects.
- Include recent chats in the sidebar when desktop chat history exists.
- Bottom phone/PC status should be an unboxed status row, not a card with a heavy border/background.
- When the sidebar is collapsed, show only the phone-status icon and tooltip;
  do not float a separate connection dot above it.
- Keep the rail expanded with recent chats until roughly tablet width; collapse to icons/tooltips around `900px`.

## Chat And Dashboard

- Chat should be calm and AI-app-like: compact prompt chips, restrained bottom composer, clean message rows.
- Keep the real desktop chat visually obvious: on wide screens show a compact
  Vibyra AI ready/thinking indicator in the upper-right of the chat workspace,
  and hide it at narrow widths where it would compete with the mobile chrome.
- The upper-right Vibyra AI indicator is a native button, not decorative UI.
  Clicking it must scroll to and focus the chat composer, and its event binding
  must be restored whenever `renderChat()` replaces the chat DOM.
- The polished desktop chat layout is owned by the late-loaded
  `desktop/assets/app.chat-polish.css`. Keep its empty state in the upper part
  of the workspace, use descriptive quick-action rows, and keep the working
  composer/history/request behavior in the existing chat JS modules.
- On an empty chat, group the headline, quick prompts, and composer as one start surface slightly above center; pin the composer to the bottom only after messages or a real run card exist.
- Chat draft and recent chat history are local shell state: `vibyra.desktop.chatDraft`, `vibyra.desktop.recentChats`, and `vibyra.desktop.activeChat`.
- Desktop chat model and reasoning controls should stay as one combined AI selector in the composer, not two separate model/effort pills. Keep backend effort values `low`, `medium`, `high`, and `xhigh`, but label them for users as `Fast`, `Balanced`, `Deep`, and `Max`.
- The chat model menu should mirror the mobile model groups/logos from `src/screens/workspace/data/chatModels.ts`, and effort values should stay `low`, `medium`, `high`, `xhigh`.
- The desktop paperclip menu should be a simple vertical list, not a top action grid. Use the same row shape for every option: icon, short label, short description. Include Photos, Files, Create image, Deep research, Agent web search, and Analyze files. Do not include Camera on desktop. Keep local AI skills such as Plan/Debug/Review in `/` slash suggestions, not in the paperclip menu.
- Do not make desktop chat start `/agents/start` directly unless there is an intentional desktop-authenticated agent contract; that route is phone-authenticated.
- After desktop auth, default to Home via the compatibility route key `vibyra.desktop.page = "dashboard"` unless a stored page intentionally overrides it.
- Home must use real desktop state only. Phone/project/activity data comes from `/desktop/state`; terminal rows come from the reconciled frontend `terminals` store because PTY sessions are not part of `/desktop/state`.
- Namespace the current Home DOM and late stylesheet with `desktop-home-*`.
  Legacy chunks still contain `.home-page`, `.home-side`, and related rules;
  reusing those selectors mixes two layout systems and misaligns Home sections.
- Keep Home aligned to the approved desktop reference: a compact greeting and
  New chat action, four equal summary cards, then a wide primary column for
  Terminals and Recent activity beside a narrower Phone and Recent projects
  column. The fourth summary is real recent activity, never fake usage.
- Home cards may use the existing Vibyra panel, border, and modest-radius tokens
  to create that structure. Preserve the current palette and avoid added glow,
  decorative metrics, or a separate dashboard color scheme.
- Home terminal status must distinguish an open PTY from active AI work. Show
  `Working` only for startup, pending state, or authoritative provider-busy
  state; an otherwise open shell remains `Ready`. Never use an elapsed-output
  timeout as completion state. The terminal worker must broadcast `busy` when
  work is submitted and `ready` when the provider restores its idle prompt;
  the renderer may mirror provider signals for already-detached legacy workers.
  Reflect the working count in the Terminals summary card and respect
  reduced-motion preferences.
- Do not invent fake counts, fake activity, fake progress bars, fake credits, or fake community/profile data.
- Show live terminals and active desktop agent runs as compact actionable rows, not predicted progress, token counts, percentages, or fallback build rows.
- Keep account/billing details in the account modal unless a real desktop account API requires more.

## AI Terminals

AI terminals should feel like calm model workspaces, not a dashboard of configuration cards.

For terminal launch, provider-routing, token-source, PTY, hidden-engine, or
stale-worker bugs, also use `vibyra-ai-terminal-diagnostics`. Do not diagnose
these failures from styling alone.
Treat “work like Codex” as a capability/interaction requirement unless the
user explicitly requests Codex's visual design.

- When Vibyra-token GPT, Claude, or Gemini terminals are intentionally designed
  to match the provider CLI, preserve the selected provider's native startup,
  prompt, activity, tool-result, and response cues end to end. The visible
  process and billing still belong to Vibyra; do not launch the official
  interactive CLI or fall back to a generic `via Vibyra` banner. Auto and
  providers without a native profile remain Vibyra-branded.

- Keep one compact icon-only sidebar button in the terminal page's top-right
  shell actions, including the no-terminal setup state. Use a familiar sidebar
  glyph, accessible label, and tooltip. Do not place AI, Voice, Memory, Preview,
  or project quick actions beside terminal tabs. The button toggles the unified
  right workspace and opens it in AI by default.
- Inside the right workspace, start directly with one compact segmented
  Editor / Preview / AI / Memory bar and the close action. Do not add a separate
  `Workspace` title or repeat the active terminal/project name above the modes.
  Keep labels visible at normal sidebar widths and collapse to icons only when
  the sidebar itself is exceptionally narrow.
- Do not expose `Preview` or `Test` in the terminal dock or project quick
  actions. Open the right workspace through its persistent sidebar launcher,
  then select Preview from the Editor / Preview / AI / Memory switcher.
- Test is a general browser preview workspace, not a phone-only mockup. Offer
  one compact resolution selector with common iPhone, Android, iPad, laptop,
  desktop, Full HD, and custom sizes; include rotation, refresh, direct URL,
  and project selection without a dashboard of device cards. Keep the preview
  inside Vibyra; do not add an Open in browser action.
- Keep Test to one compact toolbar. Show project, a short `Live` / `Starting` /
  `Refreshing` / `Failed` status, device plus quiet `Auto`, rotation, Fit/zoom,
  hidden address editing, and refresh. Do not restore a second device row,
  permanent URL field, footer status strip, or external-browser shortcut.
- Keep the selector grouped rather than flat when the device catalog is large.
  Use the calibrated CSS viewport dimensions and approximate DPR metadata from
  `/home/ellis/Desktop/PhonePreview/electron-main.js` for iPhone, Pixel,
  Galaxy/foldable, and iPad presets. Keep computers in the same selector and
  preserve one Custom option; do not duplicate presets as permanent cards.
- Selecting a project must apply the bridge-provided viewport recommendation:
  phone for mobile frameworks, laptop for ordinary websites, desktop for SaaS
  or desktop web renderers, and Full HD for browser games. Respect explicit
  manifest orientation, mark the choice quietly as `Auto`, and let any manual
  device, dimensions, or rotation change take over immediately.
- Project Test previews run under the isolated `preview.localhost` origin with
  a project-scoped preview capability, never the phone bearer token. The
  preview iframe may keep its own web origin but cannot call privileged desktop
  routes. Starting a recognized project dev server requires an explicit user
  confirmation.
- Project selection should first reuse a verified matching runtime. If no
  runtime or built output exists but the bridge has a safe launch profile,
  immediately present the exact detected framework command for confirmation;
  do not leave users to infer that they must click a generic start button.
- Keep the selected device visible while project files are inspected and an
  approved runtime starts. Use a calm Vibyra-branded progress overlay inside
  the device, concise honest status copy, a hidden `View command` disclosure,
  visible failure text, and Retry. Do not recreate a fake terminal window or
  simulated completed stage checklist.
- Keep preview diagnostics in one full-width console dock below the canvas,
  with restrained log-level color, issue-focused count, Copy, Clear, and an
  explicit close control. Preserve only its height; vertical resizing belongs
  to a dedicated top-edge handle that grows upward and shrinks downward. Never
  let the console, zoom controls, or viewport metadata float over the preview
  frame. Each warning or error gets one quiet `Fix with AI` action that leaves
  Preview and submits that individual
  diagnostic to an idle AI terminal already bound to the preview project. If
  none exists, create a new project-bound terminal with the diagnostic as its
  initial assignment. Never route this action through desktop Chat. Capture real
  `console.log/info/warn/error/debug` and runtime diagnostics from Vibyra-served
  project previews, accept messages only from the active iframe, and cap
  retained output. Refresh belongs in the existing top toolbar with visible
  in-progress feedback; do not add a separate developer-tools dashboard.
- Describe Electron/Tauri renderers, browser software, and browser games as web
  previews. Do not claim that native desktop APIs, binaries, mobile runtimes,
  or game-engine executables are running inside the browser viewport.
- Keep the terminal AI companion visually compact: use one quiet identity row,
  an internal Chat / Talk switcher, at most two useful starter rows, and a
  rounded bottom composer with the send action inside it.
  Keep identity and Chat / Talk on the same row at normal sidebar widths; never
  stack them into a second toolbar at the common 360px overlay width. Empty
  Chat should use one concise invitation and lightweight one-line starter
  actions rather than prompt cards. Make the composer the strongest interactive
  surface. Talk should use an open voice canvas and conversation transcript,
  not a large bordered card, and must not repeat the same idle status in
  multiple places.
  Treat Talk as one continuous push-to-talk conversation: center a single
  state-driven voice field above a compact live-status row, let the transcript
  fill the remaining height, and keep the AI-voice disclosure quiet at the
  bottom. Keep the transcript flat against the Talk canvas with no surrounding
  background, border, radius, or header divider; retain the `Conversation`
  label, with `You` turns aligned right and `Vibyra` turns aligned left.
  Listening, processing, speaking, and error states may change the field color
  and motion, but must not add controls, decorative dashboards, or duplicate
  raw runtime labels already communicated by the visible phase.
  Present Vibyra AI as the assistant for the whole desktop app, not as an
  assistant limited to the active terminal. Do not show copy such as `Ask about
  this terminal` or `Using context from...`; project or terminal context may
  still be used invisibly to improve routing. Avoid a redundant active-terminal
  context strip inside Chat. Keep local-model setup or availability
  warnings out of the persistent composer chrome; surface failures only when a
  request actually needs user action. Avoid a large
  centered empty-state icon or card-heavy chat bubbles.
- In the right terminal workspace, Editor, Preview, AI, and Memory are
  full-height modes beneath one compact switcher. Switching modes must preserve
  terminal sessions and mode-specific state without stacking multiple dense
  tools into the same narrow column.
- Talk to Vibyra is part of AI, not a standalone right-workspace mode. Keep its
  click-to-talk control and transcript behind the AI tab's internal Chat / Talk
  switcher, and retain `Alt+V` as the direct shortcut.
- Keep the Memory graph's `Project brain` heading anchored in its top header.
  Place zoom/pan guidance and the folder/link summary in a dedicated footer
  outside the interactive canvas so they never cover nodes or Markdown links.
- Talk is a conversation surface, not terminal dictation. Keep one prominent
  click-to-talk control with an `Alt+V` shortcut; transcribe the turn, send it
  directly through Vibyra AI with private per-terminal history, execute
  structured desktop actions through the existing approval path, and speak the
  reply. Below the primary control, show the same bounded history as a compact
  transcript with right-aligned `You` turns and left-aligned `Vibyra` turns;
  do not create a second transcript store or add transcript controls. Prefer
  `/desktop/voice/speak` audio and fall back to system speech synthesis. Do not
  show separate Enter, clear-transcript, terminal target, or manual-send controls.
  Keep voice choice and speaking speed in Settings > Preferences, not in the
  compact conversation panel. Offer every built-in voice supported by the
  active OpenAI speech model, default to `marin`, persist the choice locally,
  and use the supported `0.25x`-`4.0x` speed range for OpenAI audio and system
  fallback playback.
  Keep a visible `AI-generated voice` disclosure. Make every voice phase
  unmistakable on the primary control: microphone-off idle, red animated
  `MIC LIVE` listening, distinct processing, and purple animated
  `VIBYRA LIVE` speaking. Pair color and motion with explicit text and an
  assertive accessible status; never rely on animation or color alone. Voice
  must work from the empty terminal setup state so it can launch the first
  terminal, and a launch action must not cancel its own spoken confirmation
  when the new terminal becomes active. Do not show a `Preparing voice` phase;
  keep the control in a direct responding state until playback begins.
- Terminal dictation is a separate global push-to-talk path. Use
  `F8`, capture the selected terminal when recording starts, and send
  the transcription to that exact terminal through its normal input path.
  Show only a transient bottom-center status pill with the target terminal and
  clear starting, red listening, transcribing, sent, and error states. Do not
  add microphone buttons to every terminal or reuse the Talk transcript.
- Default to a focus view: one active terminal fills the page, with other terminals represented as quiet tabs.
- Put terminal open/close/reorder tabs in the existing desktop topbar. Do not add a second terminal nav bar inside the page body.
- Keep the terminal creation button, tabs, and options button together as one
  centered content-sized dock. The tab strip may expand and scroll for larger
  sessions, but a single terminal must not push those controls far apart.
- Label each topbar terminal tab with its real agent and visible position, such
  as `Codex 1` or `Claude 2`, instead of showing a bare number. Keep individual
  close buttons, and keep a three-dot terminal options menu with layout
  switching and a confirmed `Close all terminals` action. Give tabs enough
  width to read those labels comfortably and keep the tab group centered; let
  the tab strip scroll horizontally when many terminals are open instead of
  compressing labels.
- Keep terminal chrome, status motion, dropdown selection, and settings actions
  on Vibyra purple. Provider colors may identify content, but OpenAI/Codex teal
  must not turn the surrounding terminal UI into a green theme; ANSI green
  remains valid only for real terminal output and semantic success.
- Terminal options must include a persistent rename control backed by the PTY
  service. Grid positions are numbered in reading order, creation appends new
  terminals, and an eight-terminal wide grid uses four columns so `1` starts
  top-left and `8` ends bottom-right.
- Keep successful AI terminal assignment visually silent. The assigned prompt
  and provider response in the terminal are sufficient; do not add `Task
  accepted`, task-summary strips, animated tab statuses, or duplicate frontend
  confirmations. Continue to surface delivery failures because they require
  user action.
- Terminal notices added by incremental PTY refreshes must bind their dismiss
  control immediately. Dismiss notices in place without remounting xterm.
- Existing-terminal AI assignments must exclude plain shell sessions and honor
  explicit model/full-access compatibility. Retry only the brief startup
  `Terminal is not running` race; do not hide persistent delivery failures.
- Keep official CLI models distinct from OpenRouter wrappers in terminal model
  selection. Do not mix provider-qualified `openai/*`, `anthropic/*`, or
  `google/*` catalog entries into the terminal picker beside Codex, Claude, or
  Gemini built-ins. If an API wrapper is restored through older state, label it
  as Vibyra/OpenRouter and never render official CLI branding or slash-command
  expectations.
- Show provider setup state directly on each model row: `Download` before an
  install, a visible rotating ring plus `Downloading` during the bounded
  request, then no installation badge once the CLI is available. Never expose
  internal adapter terminology or represent download work with the terminal
  canvas loading wheel. Keep unavailable rows from creating a local terminal.
- Auto is immediately launchable with Vibyra tokens and does not require a
  project or setup task. Open the Vibyra `❯ auto` terminal first; after the user
  submits the first prompt, keep the same tab/session while routing into the
  selected native provider CLI.
- Auto terminals use a code-native ANSI Vibyra intro, not an image asset or an
  imitation provider banner. Keep the `V` compact, symmetrical, and built from
  reliable fixed-width ASCII strokes; dense block/shade glyphs render
  inconsistently across xterm fonts. Use a solid symmetric `#####\ /#####`
  face that closes into a clean point, with one consistent amber extrusion on
  the outer right/down edge; never expose a duplicate rear face inside the V.
  Do not add colon extrusion or a second CSS watermark. Use `desktop/icon.svg` as
  the canonical logo palette: violet `#7B2CFF`, pink `#FF35C8`, and amber
  `#FFB84D`. Map the left face, right face, and extrusion to those exact colors
  respectively, and preserve the default terminal background. Keep the panel concise: workspace, first-task automatic routing,
  task categories, and one help hint; do not repeat reasoning effort in the
  Auto intro. Keep xterm text selection translucent so it does not obscure
  ANSI branding or resemble a large painted background. The desktop process
  may inherit `NO_COLOR=1`; Vibyra wrapper launches must set
  `VIBYRA_TERMINAL_COLOR=1` and honor that explicit app capability before the
  ambient flag. Preserve the renderer compatibility pass that colors legacy
  plain Auto snapshots without changing their stored PTY output. ANSI helpers
  must return empty segments unchanged and must never emit a color sequence
  without a numeric color code; replay strips the historical
  `ESC[undefinedm` corruption before writing snapshots to xterm.
- Auto model selection happens for the first submitted task. Show one quiet
  matching state while that request is in flight, then keep the same terminal
  session on the concrete routed provider. Show the actual model and short
  routing reason returned by the server. Never claim a friendly model label
  unless the backend sent that exact provider slug, and keep manual model
  selections fixed.
- Scope Vibyra motion to the authoritative `.terminal-auto-waiting` state.
  Keep the terminal-rendered ASCII V as the only V logo: do not add a watermark,
  orbit, or duplicate pseudo-element mark over the PTY. While first-task routing
  is pending, clear once into a dedicated full-screen ANSI V state and redraw
  from terminal home after clearing visible content and scrollback. Anchor the
  Vibyra title on the actual terminal center row. Keep logo geometry identical
  while a diagonal truecolor wave crosses individual face/depth cells; a
  fixed-width signal track may move one spark without changing line length.
  Never use cursor-relative movement or changing status wording. Persist only
  the initial frame, stop and restore the cursor before the provider process
  starts, and keep a bounded minimum presentation long enough to show at least
  four frames even when routing returns immediately. Never let animation ticks
  enter recovery snapshots. A restrained
  readiness pulse may decorate the idle state. Never animate, transform,
  resize, or hide
  `.terminal-xterm`, xterm viewport/screen elements, or authoritative PTY
  output. Shared terminal chrome may use short paint-only hover, focus, notice,
  and setup transitions without changing grid gaps or pane geometry.
- Follow-up wording such as `them` or `the terminals you just opened` must
  resolve through the current chat's bounded recent terminal batch and exact
  terminal IDs. Missing or stale batch identity fails closed. Never open
  replacements after an assignment failure unless the user explicitly asks to
  open additional terminals.
- Send AI jobs through semantic `POST /desktop/pty-terminals/:id/assign` with a
  unique idempotent assignment ID and require the detached worker to acknowledge
  `written-to-child`, but do not render that acknowledgement as terminal UI.
  Keep raw `/input` for keyboard traffic.
- When no terminals exist, show a simple setup panel with one compact count
  row, a custom count up to 12, Project and Model side by side when space
  allows, and one primary launch action. Do not add a decorative terminal-count
  preview. Keep reasoning and token-source controls under `Advanced settings`;
  keep multi-terminal workspace safety visible because it changes file
  isolation.
- Treat terminal token source as enforced routing. `Vibyra tokens` should use
  the Vibyra-owned terminal UI and membership-credit backend. It may use Codex
  as a hidden non-interactive JSON agent engine, but must never show the Codex
  TUI or replace provider words inside another product's interface. Show
  `OpenAI Codex` only for terminals launched through `My AI accounts`. Keep
  Vibyra's isolated `CODEX_HOME` free of `auth.json` and inherited OpenAI API
  credentials. `My AI accounts` must filter the model picker to models
  supported by connected official CLI accounts and fail closed when the
  runtime is missing. ChatGPT-authenticated Codex launches Codex, while
  installed Claude Code and Gemini CLI launch their own native sign-in and
  billing flows. Do not present an OpenAI API key as a ChatGPT subscription,
  treat provider-qualified API wrappers as native accounts, or let inherited
  credentials cross billing paths.
- Selecting an available unqualified Claude or Gemini model must automatically
  use its `My AI accounts` route when the Vibyra-credit adapter is unavailable.
  Do not disable the model row, require users to discover Advanced settings,
  or leave the terminal loading after the native composer or trust screen is
  visible.
- Before approving a wrong-terminal fix, inspect the authoritative live PTY
  transcript. Tests and renamed strings are insufficient: Vibyra-token output
  must contain the Vibyra-owned banner/prompt and no official provider TUI.
  Replace stale detached workers before judging a renderer reload.
- Keep the empty terminal setup and its right-side Vibyra AI companion
  positionally stable while changing count, project, model, reasoning, token
  source, or workspace safety. Patch only `.terminal-setup-panel`; never replace
  the outer `.terminal-setup` while its companion is open. Safely center the
  panel in `.terminal-setup-stage`; when it grows beyond the available height,
  let that stage scroll instead of moving or clipping the companion.
- Give empty setup the same full-height, edge-attached companion track as an
  opened terminal. Put setup scrolling and padding on `.terminal-setup-stage`,
  not the outer grid, and animate between matching two-column grid tracks. Run
  companion entrance animation only on initial insertion, not internal updates.
  Before launch, use the selected setup project for the companion subtitle and
  Memory half while retaining the private `"setup"` chat/action scope.
- Render the terminal starter model picker as a viewport-anchored overlay.
  Measure it from the model button, clamp it before the companion/right edge,
  and always open it directly below the button. When vertical room is limited,
  constrain the overlay to the remaining space and scroll its model list; do
  not flip it above. Never use `position: static` for this picker because
  opening it must not resize or move the centered setup card.
- Preserve the focused terminal surface and tab behavior during visual cleanup.
  Keep the three-dot menu concise: use one inline rename row, then Project,
  Workspace, Access, an optional quiet path row, and the separated close action.
  Do not show token source or billing controls in the per-terminal menu; those
  belong in terminal setup's Advanced settings.
- For two or more project terminals, keep workspace isolation as one quiet
  two-choice row: recommended `Safe mode` or advanced `Shared folder`. Safe
  mode is the default for users without a saved preference and means separate
  local branches/files that prevent terminal overlap. Explain that its local
  checkpoint stays on the computer. Do not require or imply GitHub integration,
  and do not expose backend-managed worktree paths as editable browser inputs.
- Show each project terminal's effective workspace beside its header metadata:
  `Separate branch` with the branch name, `Shared folder`, or an amber
  `Shared for now` when requested isolation was unavailable. Dirty-project
  guidance must use plain language: explain that current changes need a local
  checkpoint, files were not deleted, and GitHub is not required. Clicking the
  compact indicator may reuse the terminal notice surface for the explanation.
  Patch indicator state in place so workspace updates never remount xterm.
- Before setup launches `Separate branches`, preflight the selected project.
  If it has non-ignored changes, show one approval dialog with the changed-file
  count and `Save checkpoint and continue`; state that the checkpoint stays on
  the computer and nothing is uploaded. Never create the commit without
  approval, and never silently fall back to shared mode after this guided flow.
- The no-terminal setup panel must derive reasoning support from each selected
  OpenRouter model's catalog metadata. Show `Low`, `Medium`, `High`, and
  `Extra high` only when `supported_parameters` includes `reasoning`; otherwise
  omit the control and let the model use its default. Persist the selected
  reasoning level and pass `low`, `medium`, `high`, or `xhigh` to every spawned
  terminal. OpenRouter owns nearest-level mapping for models with fewer levels.
- Keep grid mode available as an explicit layout toggle for users who want multiple terminals visible at once.
- Never auto-switch to grid when terminal count grows. Bulk creation stays in
  focus mode so existing xterm instances are not remounted at an arbitrary
  count threshold.
- Support up to 12 terminals through tabs/status dots, not by forcing 12 fully-expanded control cards into the first view.
- In grid mode, preserve readable tiles instead of shrinking every terminal to fit the viewport. Keep medium/narrow grids at two columns with roughly `230px` minimum tile height and vertical overview scrolling; below phone width, use one column. Keep the active tab scrolled into view and position terminal settings menus against the viewport so lower-row menus are not clipped.
- Natural-language desktop control requests must resolve to structured local
  actions before the browser launches terminals. Keep parsing in
  `desktop/lib/desktopActions.mjs` and execution in
  `desktop/assets/app.desktop-actions.js`; do not execute arbitrary assistant
  prose as a desktop command.
- Full terminal access is opt-in only. Require explicit wording such as
  `full permissions`, persist `permissionMode: "full"`, show the state on the
  terminal, and pass Codex
  `--dangerously-bypass-approvals-and-sandbox`. Standard requests must retain
  the CLI's normal approvals and sandbox defaults.
- Permission follow-ups for already-open terminals must use the structured
  `set_terminal_permissions` action. Confirm that relaunch ends current
  processes, then preserve each Codex terminal's model, reasoning, project,
  token source, and active-tab identity across the relaunch.
- Do not infer Codex capability from OpenAI provider metadata alone.
  Provider-qualified `openai/*` models use the Vibyra wrapper and cannot claim
  Codex full-access behavior.
- New terminal creation should offer the same chat/OpenRouter model picker with provider logos, not local skill presets.
- Anchor the new-terminal model picker directly below the `+` launcher. Measure
  the launcher after render, clamp the fixed menu to viewport edges, and flip
  above only when the menu cannot fit below; never center this menu on the
  window independently of its trigger. Keep it hidden until measured so it
  cannot flash at fallback coordinates. In Electron, account for the
  transformed `.desktop-chrome-page` fixed-position containing block instead
  of applying viewport coordinates directly to the popover.
- Terminal topbar and per-terminal menu buttons must have one click owner.
  The PTY incremental binder must skip controls already marked by the base
  terminal binder; double binding makes `+` and three-dot menus toggle twice.
- Route provider-qualified OpenRouter slugs such as
  `openai/gpt-5.5-pro` through the Vibyra wrapper. Only built-in unqualified
  Codex/Claude/Gemini model keys may launch official local CLIs; provider name
  alone does not prove that a catalog model is accepted by that CLI or account.
- Keep detached wrapper requests pointed at the local bridge origin, not the
  `/desktop` page URL. Strip any inherited `/desktop` suffix before appending
  `/desktop/chat`; a doubled path falls into phone auth and surfaces a false
  desktop-token error.
- Keep setup/new-terminal project selection as a real button + listbox menu, not a transparent native select over a styled row. Patch only the picker DOM when it opens or changes, preserve keyboard focus across the one-second desktop refresh, and store the preference in `localStorage["vibyra.desktop.terminalProject"]`.
- Include a `Full PC` project option backed by the fixed `full-pc` scope. The
  bridge resolves it to the current user's home directory; it changes terminal
  working scope but does not imply full permissions or approval bypass.
- Keep terminal task lifetime independent from the renderer and window. Refresh, renderer crash, bridge restart, or hiding/closing the desktop window must reconnect to the detached persisted worker without stopping or replaying the active prompt. Only an explicit terminal close may terminate and remove the worker; a missing worker must be shown as unavailable rather than auto-restarted.
- Treat `GET /desktop/pty-terminals` as authoritative on load and after socket
  reconnect. Import backend sessions, drop stale browser-only terminal records,
  preserve only an in-flight pending create, and patch the existing terminal
  DOM rather than remounting xterm.
- Keep runtime terminal dimensions synchronized across the visible xterm host,
  xterm rows/columns, and the actual pseudo-TTY. On Linux, resize the
  `/usr/bin/script` PTY device before signaling its session process group.
  Never use the persistent handle's `kill()` method for resize because that
  method means explicit terminal close.
- Contain PTY WebSocket input errors inside the socket listener. Xterm may send
  protocol/device responses before a recovered worker is writable; a `409`
  must not escape and crash the desktop bridge.
- Keep explicit close delivery alive while the persistent worker socket is
  connecting. Do not cancel retry before the queued close reaches the worker.
- Electron startup/recovery must not reveal Chromium's internal error page.
  Only the configured `/desktop` URL counts as a successful load; supervise
  bridge health and retry while the window remains hidden.
- Re-running `npm run desktop` against an open single-instance Electron window
  must reload the renderer without cache before focusing it. Keep `F5`,
  `Ctrl+R`, and `Cmd+R` wired to the same explicit cache-bypassing reload
  because the frameless window has no normal menu accelerator to rely on.
- On Linux, detached bridge and terminal-worker launches must close inherited
  descriptors above `2` before `exec`, or Electron sockets can leak into
  terminal process trees.
- Hide model, effort, project, and close controls inside a compact settings popover per terminal. Do not show every dropdown on every terminal by default.
- In terminal output, prioritize readable monospace content with minimal prompts (`$`, `vibyra`) and generous spacing. Avoid large empty-state icons, heavy nested borders, or repeated labels.
- Use restrained status: a small dot for idle/running and a subtle active tab/surface treatment. Avoid progress dashboards, bright badges, and per-card metadata clutter.
- Voice/Memory companion panels must mount only while open, use one shared close
  pattern, render only the active tool, preserve and refit mounted xterm nodes,
  and keep keyboard focus visible. Keep the companion on the right through the
  Electron `860px` minimum width. The right companion width is user-resizable
  and persisted locally. Clamp it between 280px and 720px while preserving at
  least 420px for the terminal, refit mounted xterms during/after resizing, and
  keep the splitter keyboard accessible. Memory may expand into a focused
  in-app workspace that replaces the terminal canvas without stopping or
  remounting terminal sessions; Escape or restore returns to the saved split
  width and refits xterm.
  While any Vibyra AI companion is open, temporarily collapse the left rail to
  its icon-only state without overwriting the user's saved rail preference.
  Keep expansion locked until the companion closes, then restore the prior rail
  state. Animate both shell and companion layout changes and honor reduced
  motion.
  Electron Voice uses recorded-audio transcription through the local bridge;
  do not depend on Web Speech recognition in Electron, and stop every microphone
  track on denial, recorder failure, tab/project change, panel close, and page
  hide. Memory must use canonical project-scoped cloud entries.
- The expanded Memory tool may use an Obsidian-style explorer and Markdown
  editor, but folders/documents remain backend-owned project vault nodes.
  Markdown or Obsidian imports must send normalized relative paths and text
  content only; never expose or persist arbitrary local filesystem paths.
- Fullscreen Memory must become a dedicated Obsidian-style application shell,
  not a stretched companion card. Use a top tab/action bar, narrow tool ribbon,
  real vault explorer on the left, Graph/Notes workspace in the center, and a
  real-data Links panel on the right. Expand top-level folders on entry so files
  are immediately visible, and never invent notes, counts, links, or graph
  relationships for visual effect.
- Empty project Memory should show one focused `Import` action for an Obsidian
  vault or Markdown folder. Do not expose AI generation, starter-vault creation,
  discovery, or separate file/folder import choices.
- Memory imports in Electron should open a main-process native file dialog
  through the narrow preload memory picker API. Return only normalized relative
  paths and note text to the renderer; never expose or retain absolute local
  paths. Keep browser file inputs and drag-and-drop as non-Electron fallbacks,
  and keep `.md` visibly named and accepted. When Electron takes over, hide the
  fallback file input and remove it from pointer hit-testing; a disabled
  full-row file input overlay blocks real clicks on the visible import row.
- Keep import singular across compact, fullscreen, and empty-vault Memory.
  The visible `Import` control should open the native folder picker in Electron;
  browser folder input and drag-and-drop are fallbacks, not additional choices.
- Do not expose New Note, New Folder, or item-creation keyboard controls in
  Memory. Files and folder structure come from Import; imported notes remain
  editable.
- Once populated, Memory should open as a restrained project-brain graph:
  render real folder and Markdown-link relationships, leave unlinked notes
  visually separate, reveal labels on interaction, and open document nodes in
  the Notes editor. Avoid a decorative fake network disconnected from vault
  data. Dense imports need a deterministic force-spaced canvas, persistent
  folder/high-degree labels, bounded zoom controls, wheel zoom, drag-to-pan,
  and a Fit reset; do not compress every folder cluster into one radial column.
  Use real folder-region halos, cluster colors, hub orbits, curved Markdown
  links, and hover neighborhood isolation to improve comprehension without
  inventing relationships. Keep document editing free of a large bottom action
  bar; do not show `Insert into terminal` or a prominent delete action there.
- Do not expose AI-created Memory controls in the desktop Memory frontend.
- Keep the terminal dock free of AI, Voice, Memory, and Preview launchers. The
  single sidebar button is the discovery path; slash commands remain optional
  shortcuts. Show active state on that one launcher.

## Projects

- Projects should keep the full-width shell style: toolbar below the top bar and a compact card grid.
- On wide screens, use a three-card grid with roughly 176px cards, 16px padding, about 14px column gaps, and 16px row gaps.
- Active project cards should use a purple border; avoid invented project counts or activity metadata.

## Screenshot Capture

- `F9` is the system-wide screenshot shortcut while Electron is running. Capture
  the display under the pointer before revealing Vibyra, then open one
  full-window editor without remounting terminal or shell state.
- Treat pressing `F9` as the capture consent boundary. Keep captures local and
  transient; write or copy the PNG only after explicit Save or Copy.
- Default to Crop and keep Box, Pen, undo, reset, Copy, and Save in one quiet
  toolbar/footer system. Show Apply crop only after a valid crop selection.
- Keep annotation coordinates at native image resolution while fitting the
  canvas responsively. Bound full-resolution undo history to avoid 4K memory
  spikes.
- Use a narrow preload API for capture events and PNG Copy/Save. Main-process
  code owns `globalShortcut`, `desktopCapturer`, clipboard, save dialogs, and
  platform screen-recording errors.
- Main-process and preload changes require a real Electron relaunch, not a
  renderer refresh. Keep the source watcher active and retain
  `~/.vibyra-desktop/electron.log` so shortcut registration/capture failures are
  diagnosable instead of being discarded.

## Theme Switching

- Desktop appearance is local profile preference state: `localStorage["vibyra.desktop.profilePreferences"].appearance` drives `body[data-desktop-theme]`. Do not add another theme store.
- Keep `desktop/app.html` applying saved `data-desktop-theme` and `data-chat-font` before visible shell content renders, so launch does not flash the wrong theme.
- Theme CSS must be late-loaded and token-based. Use `app.theme.css` for semantic tokens, `app.theme-shell.css` for shell/topbar/sidebar, `app.theme-chat.css` for chat/composer/menu states, `app.theme-surfaces*.css` for modals/profile/forms, `app.theme-terminals*.css` for terminal surfaces, and `app.theme-auth.css` for the always-dark logged-out welcome screen.
- Home CSS loads late as `app.home.css`, but it must stay scoped to `.home-*` selectors and must not own global shell chrome. Do not use route-wide `body:has(...)` overrides for `.app`, `.rail`, `.topbar`, navigation, or account/phone controls.
- Profile, account, token, pair, and shared form controls must resolve through late `--surface-*` tokens. Do not leave white-alpha dark literals on modal inputs, selects, textareas, session menus, toggles, appearance cards, delete panels, or profile dividers.
- The billing plan picker keeps its image-led layout, but `app.billing-plans.css` must route colors through `--billing-*` variables defined in `app.billing-plans.theme.css`; verify `#token-modal .modal--billing-revamp`, plan rows, segmented controls, hero copy, chips, and secondary buttons in light and dark.
- In late theme files, audit interactive states as well as base panels. Topbar/account/chat action dropdown danger and disabled states should use theme error/dim tokens, and light-mode chat send controls should not stay white on a white composer.
- Before finishing any desktop UI/theme edit, run a computed-style probe for explicit `light` and `dark` across: Home, Profile modal fields, Token billing modal, Pair modal, chat model/attach/slash menus, active send button, terminal setup/model/settings controls, and terminal companion/PTY surfaces.

## Terminal Theme Checks

- For AI terminals, keep split CSS files (`app.terminals*.css`, `app.terminals-companion.css`, `app.terminals.pty.css`) routed through `app.theme-terminals.css`, `app.theme-terminals-states.css`, and `app.theme-terminals-controls.css` tokens for surfaces, text, disabled states, model picker rows, settings/token-source forms, PTY fallback text, and companion panels. Do not leave hardcoded dark text boxes in terminal setup/model/settings UI.
- Existing xterm instances do not automatically repaint from CSS variable changes. Keep the PTY runtime reapplying `terminalXtermTheme()` when `body[data-desktop-theme]` changes, without remounting xterm nodes.
- Persisted xterm transcript replay must temporarily suppress `onData` forwarding; terminal device-response sequences emitted during replay are renderer output, not user keyboard input.
- Xterm owns keyboard input whenever it is available. Keep fallback host
  keydown/paste handlers inert if xterm appears after binding, ignore `onData`
  from detached or replaced xterms, and keep `screenReaderMode` disabled in the
  Electron terminal surface to avoid duplicated input events.
- Keep idle/running/success/error/stopped/unavailable dots semantic in both themes, and define separate light/dark xterm ANSI palettes so command output remains readable beyond the base background/foreground colors.
- Start desktop polling only from `app.boot.js`, after terminal scripts are loaded. In `app.shell.js`, compare the serialized `/desktop/state` payload and skip `render()` when it is unchanged; otherwise the terminal topbar flashes every second and slow startup can briefly show the legacy chat-style terminal surface.
- For flashing regressions, use a `MutationObserver` on the terminal content
  root and verify page, terminal article, and xterm node identity across at
  least five seconds. Xterm screen mutations are expected; mutations outside
  `.xterm`, article removals, or page replacement are not.
- Validate terminal theme work with computed-style probes for setup, model picker, settings menu, token-source form, PTY/xterm container, and companion panel in both explicit light and explicit dark. Also toggle appearance while a PTY exists so mounted xterm instances repaint without DOM remount.

## Common Mistakes To Avoid

- Adding boxes around every control.
- Showing profile/session metadata where an avatar is enough.
- Making desktop look more like an admin dashboard than the mobile app.
- Collapsing useful sidebar content too early on medium screens.
- Cropping the Vibyra logo with hidden overflow or negative image positioning.
- Adding explanatory text inside the app for obvious controls.

## Responsive Checks

Before finishing visual work:

- Run syntax checks for changed desktop JS: `node --check desktop/assets/app.1.js`, etc.
- Use browser screenshots at desktop, medium, and small widths, for example `1360x820`, `940x760`, and `700x760`.
- Check that text does not wrap awkwardly, the logo is not clipped, topbar controls are unboxed, and sidebar content collapses only when useful.
- If using headless Chrome, include `--run-all-compositor-stages-before-draw --virtual-time-budget=2000` for reliable small-width screenshots.
