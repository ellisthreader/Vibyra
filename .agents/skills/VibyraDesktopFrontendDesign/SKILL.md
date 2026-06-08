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
- The desktop auth session is visual-only local shell state stored in `localStorage["vibyra.desktop.auth"]`; do not imply real billing/account balance unless a desktop account API exists.
- Keep the same first-page feature labels as mobile: Beautiful, Fast, Code.
- Hide the feature strip while the email form is expanded.
- Keep the Vibyra logo visible and unclipped: use `object-fit: contain`, avoid negative offsets, and avoid hidden overflow around the logo.
- Provider buttons must stay on one line: `Continue with Google`, `Continue with Apple`, `Continue with email`.
- Use real provider marks/SVGs, not placeholder letters.
- Do not add quizzes, onboarding flows, or connect pages. After login, go straight to Builds/dashboard.
- The account modal owns session controls; `Log out` should clear the local desktop session and return to the auth screen.

## Top Bar

Keep it extremely simple.

- Phone status: show only a phone icon, plus a small green dot when connected.
- Do not show a bordered connection pill with repeated text.
- Profile: show only a Google-style avatar/image or first initial.
- Do not show `Desktop session`, plan text, email text, or a boxed account chip in the top bar.
- Controls should be unboxed by default; use hover feedback only.

## Sidebar

The sidebar should feel like the mobile app’s AI/chat navigation.

- Keep the Vibyra logo at the top.
- Keep the rail on the same semantic background as the main shell; use its subtle border and row states for separation instead of an elevated contrasting fill.
- Do not show a profile card/block at the top of the sidebar.
- Primary nav should stay simple: Chat, Projects, Builds.
- Include recent chats in the sidebar when desktop chat history exists.
- Bottom phone/PC status should be an unboxed status row, not a card with a heavy border/background.
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
- After desktop auth, default to Builds/dashboard via `vibyra.desktop.page = "dashboard"` unless a stored page intentionally overrides it.
- Builds/dashboard must use real `/desktop/state` data only.
- Do not invent fake counts, fake activity, fake progress bars, fake credits, or fake community/profile data.
- Show active desktop agent runs from real state as compact rows, not predicted progress, token counts, percentages, or fallback build rows.
- Keep account/billing details in the account modal unless a real desktop account API requires more.

## AI Terminals

AI terminals should feel like calm model workspaces, not a dashboard of configuration cards.

- Keep one labeled `Vibyra AI` button in the terminal page's top-right shell
  actions, including the no-terminal setup state. Do not duplicate Voice or
  Memory beside terminal tabs or as companion navigation tabs. The launcher
  opens Chat beside the terminal; Voice is a compact chat action plus `Alt+V`,
  and project Memory remains visible in the lower half of the companion.
- Keep the terminal Chat companion visually compact: use a title row, visible
  Chat/Voice controls, useful starter rows, and a rounded bottom composer.
  Present Vibyra AI as the assistant for the whole desktop app, not as an
  assistant limited to the active terminal. Do not show copy such as `Ask about
  this terminal` or `Using context from...`; project or terminal context may
  still be used invisibly to improve routing. Avoid a redundant active-terminal
  context strip inside Chat. Keep local-model setup or availability
  warnings out of the persistent composer chrome; surface failures only when a
  request actually needs user action. Avoid a large
  centered empty-state icon or card-heavy chat bubbles.
- In the right terminal companion, split the available body height evenly:
  Chat or Voice occupies the upper half and project Memory remains visible in
  the lower half. Each half scrolls independently; do not make Memory widen the
  companion or replace Chat as a full-height mode. Keep the outer companion
  rows at `auto minmax(0, 1fr)`, the inner stack at two equal
  `minmax(0, 1fr)` rows, and remove stacked graph minimum heights that could
  force Memory beyond its half.
- Voice is a conversation surface, not terminal dictation. Keep one prominent
  click-to-talk control with an `Alt+V` shortcut; transcribe the turn, send it
  directly through Vibyra AI with private per-terminal history, execute
  structured desktop actions through the existing approval path, and speak the
  reply. Below the primary control, show the same bounded history as a compact
  transcript with right-aligned `You` turns and left-aligned `Vibyra` turns;
  do not create a second transcript store or add transcript controls. Prefer
  `/desktop/voice/speak` audio and fall back to system speech synthesis. Do not
  show separate Enter, clear-transcript, terminal target, or manual-send controls.
  Keep a visible `AI-generated voice` disclosure. Make every voice phase
  unmistakable on the primary control: microphone-off idle, red animated
  `MIC LIVE` listening, distinct processing, and purple animated
  `VIBYRA LIVE` speaking. Pair color and motion with explicit text and an
  assertive accessible status; never rely on animation or color alone. Voice
  must work from the empty terminal setup state so it can launch the first
  terminal, and a launch action must not cancel its own spoken confirmation
  when the new terminal becomes active. Do not show a `Preparing voice` phase;
  keep the control in a direct responding state until playback begins.
- Default to a focus view: one active terminal fills the page, with other terminals represented as quiet tabs.
- Put terminal open/close/reorder tabs in the existing desktop topbar. Do not add a second terminal nav bar inside the page body.
- Keep terminal chrome, status motion, dropdown selection, and settings actions
  on Vibyra purple. Provider colors may identify content, but OpenAI/Codex teal
  must not turn the surrounding terminal UI into a green theme; ANSI green
  remains valid only for real terminal output and semantic success.
- Terminal options must include a persistent rename control backed by the PTY
  service. Grid positions are numbered in reading order, creation appends new
  terminals, and an eight-terminal wide grid uses four columns so `1` starts
  top-left and `8` ends bottom-right.
- When Vibyra AI assigns work to an open terminal, show a compact live activity
  strip with the real task summary and an animated tab status. Drive it from
  assignment delivery and PTY output, keep it transient and memory-only, honor
  reduced motion, and never imply a percentage or completion state the PTY
  cannot prove.
- Distinguish delivery from execution: show `Task accepted` after the bridge
  accepts stdin, and show `Vibyra is working` only after real PTY output. Clear
  the transient state on failure, exit, removal, or inactivity.
- Existing-terminal AI assignments must exclude plain shell sessions and honor
  explicit model/full-access compatibility. Retry only the brief startup
  `Terminal is not running` race; do not hide persistent delivery failures.
- When no terminals exist, show a simple setup panel with one compact count
  row, a custom count up to 12, Project and Model side by side when space
  allows, and one primary launch action. Do not add a decorative terminal-count
  preview. Keep reasoning and token-source controls under `Advanced settings`;
  keep multi-terminal workspace safety visible because it changes file
  isolation.
- Preserve the focused terminal surface and tab behavior during visual cleanup.
  Put Project, Workspace, Access, technical details, and the separated close
  action in the existing three-dot terminal options menu rather than adding
  more permanent terminal chrome.
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
- Keep labeled Voice and Memory launchers visible beside terminal tabs and on
  the empty terminal setup screen. Slash commands remain shortcuts, not the
  only discovery path. Show the active companion state and collapse labels to
  icons only when the desktop title bar is genuinely narrow.

## Projects

- Projects should keep the full-width shell style: toolbar below the top bar and a compact card grid.
- On wide screens, use a three-card grid with roughly 176px cards, 16px padding, about 14px column gaps, and 16px row gaps.
- Active project cards should use a purple border; avoid invented project counts or activity metadata.

## Theme Switching

- Desktop appearance is local profile preference state: `localStorage["vibyra.desktop.profilePreferences"].appearance` drives `body[data-desktop-theme]`. Do not add another theme store.
- Keep `desktop/app.html` applying saved `data-desktop-theme` and `data-chat-font` before visible shell content renders, so launch does not flash the wrong theme.
- Theme CSS must be late-loaded and token-based. Use `app.theme.css` for semantic tokens, `app.theme-shell.css` for shell/topbar/sidebar, `app.theme-chat.css` for chat/composer/menu states, `app.theme-surfaces*.css` for modals/profile/forms, `app.theme-terminals*.css` for terminal surfaces, and `app.theme-auth.css` for the always-dark logged-out welcome screen.
- Builds/dashboard CSS loads after the theme files but must not own global shell chrome. Do not let `.builds-page--screenshot` override `.app` grid width, `.rail`, `.topbar`, nav row sizing, logo color, or phone/account controls. Route Builds content colors through local `--build-*` variables that resolve to the active semantic theme tokens.
- Profile, account, token, pair, and shared form controls must resolve through late `--surface-*` tokens. Do not leave white-alpha dark literals on modal inputs, selects, textareas, session menus, toggles, appearance cards, delete panels, or profile dividers.
- The billing plan picker keeps its image-led layout, but `app.billing-plans.css` must route colors through `--billing-*` variables defined in `app.billing-plans.theme.css`; verify `#token-modal .modal--billing-revamp`, plan rows, segmented controls, hero copy, chips, and secondary buttons in light and dark.
- In late theme files, audit interactive states as well as base panels. Topbar/account/chat action dropdown danger and disabled states should use theme error/dim tokens, and light-mode chat send controls should not stay white on a white composer.
- Before finishing any desktop UI/theme edit, run a computed-style probe for explicit `light` and `dark` across: Builds/dashboard, Profile modal fields, Token billing modal, Pair modal, chat model/attach/slash menus, active send button, terminal setup/model/settings controls, and terminal companion/PTY surfaces.

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
