# Desktop Settings Simplification Plan

Status: implementation-ready design plan; no product code has been changed.
Audit date: 2026-08-21.
Surface: `desktop-tauri/` Settings modal.

## Goal

Make Settings understandable on first open while preserving every important
account, permission, billing, privacy, and runtime boundary. The default view
should present common choices; technical and rare controls should remain
reachable without competing with the primary path.

## Current-State Audit

The current implementation has seven equal-weight navigation items: Profile,
General, Notifications, Vibyra AI, Integrations, Custom agents, and Shortcuts.
The live 860 x 600 modal is visually consistent, but the information hierarchy
makes expert setup look like routine configuration.

### What already works

- The modal, sidebar, grouped rows, theme support, and focus handling are
  consistent with the desktop shell.
- Provider disconnect, account logout with live terminals, OS notification
  permission, and API-key storage have appropriate confirmation or consent
  boundaries.
- OpenAI keys stay in the operating-system credential store; provider browser
  authorization remains native; spend limits remain native-enforced.
- Contextual entry points already deep-link to Notifications, Integrations,
  Vibyra AI, Shortcuts, or Graphics.
- Settings source files currently respect the 200-line source limit.

### Main usability problems

| Priority | Problem | User impact | Current examples |
| --- | --- | --- | --- |
| High | Primary and expert controls have equal prominence | A first-time user cannot tell what must be configured | Custom agents, raw shell/font paths, GPU modes, model catalog, and theme are peers |
| High | Copy repeats the hierarchy instead of helping a decision | Users must read before every simple action | Sidebar label, page title, page blurb, lead paragraph, section label, row hint |
| High | AI ownership is split across two pages | “OpenAI account” and “OpenAI key” can appear to be the same connection | Vibyra AI versus Integrations |
| High | Text and numeric fields save on every change without save feedback | Partial values can be persisted and failures are invisible | Font, shell, folders, scrollback, and spend limits |
| Medium | Notifications expose the full matrix immediately | Common on/off choices are buried in per-event sounds and channel icons | Eight event rows, cue selects, play buttons, monitor buttons, switches |
| Medium | Technical values are presented as raw inputs | Users must understand paths, font stacks, scrollback, PATH, and renderer internals | General and Custom agents |
| Medium | Operational status is presented as a setting | Healthy automatic systems create visual noise | OpenRouter model count, cache source, and Refresh |
| Medium | Narrow navigation becomes a horizontal strip | Sections can be hidden off-screen and require sideways discovery | `settings-modal-narrow.css` below 700 px |
| Low | Static reference content occupies Settings | Information is duplicated instead of being available on demand | Six “Inside Vibyra” shortcut rows |

## Design Rules

1. Show one page title. Do not add a page subtitle or lead paragraph unless the
   user needs one sentence to understand a consequence.
2. Default to common choices. Put technical overrides and rare integrations in
   Advanced.
3. Show status before explanation: `Connected`, `Not set up`, `Blocked`, or
   `Restart required` should be scannable without reading a paragraph.
4. Keep destructive actions, permission prompts, billing limits, privacy
   consequences, and secure-storage failures explicit.
5. Use human controls: folder pickers, detected-shell choices, presets, and
   segmented controls before raw strings or numbers.
6. Apply switches and theme changes immediately. Commit editable text and
   numbers on blur, Enter, or an explicit Save action.
7. Show save state only when useful: `Saving`, `Saved`, or `Could not save` in
   the header. Remove the permanent “Changes apply live and persist on disk.”
8. Keep advanced controls within two clicks of Settings; do not delete support
   for existing stored values.

## Proposed Information Architecture

The sidebar should have five primary entries and one visually secondary entry:

1. General
2. AI accounts
3. Notifications
4. Shortcuts
5. Account
6. Advanced — separated at the bottom of the sidebar

`AI accounts` is an intentional proposed replacement for the current
`Integrations` navigation label. It should change only as part of this full
information-architecture implementation; provider authorization and model
selection ownership do not change with the label.

Settings should always open on General. Contextual links can open a specific
section and reveal an advanced panel when necessary.

```text
Settings
├─ General
│  ├─ Appearance
│  └─ Privacy
├─ AI accounts
│  ├─ Terminal accounts
│  └─ Vibyra features
├─ Notifications
│  ├─ Core choices
│  └─ Customize notifications (collapsed)
├─ Shortcuts
├─ Account
└─ Advanced
   ├─ Terminal
   ├─ Files and screenshots
   ├─ Graphics
   └─ Runtimes
```

### General

The entire default page should fit without scrolling at the existing modal
size.

- Replace the three large theme cards with one `Auto / Dark / Light` segmented
  control.
- Keep terminal text size, but use a compact stepper or preset selector. Keep a
  custom numeric value compatible for existing users.
- Keep `Restore terminal history` visible because it has a privacy consequence.
  Copy: “Reopen recent terminal output on this device.”
- Do not show font family, scrollback count, default shell, folders, screenshot
  behavior, or graphics mode here.

### AI accounts

Merge the user-facing Vibyra AI and Integrations destinations without merging
their security or billing ownership.

#### Terminal accounts

- Show compact OpenAI, Anthropic, and Google rows with logo, provider name,
  status, and one action.
- Use one short group sentence: “Connect the accounts used by terminal agents.”
- Show account identity only when connected. Hide duplicate product/detail text.
- Preserve native CLI/browser authorization, cancel, open-sign-in-page, and
  confirmed disconnect behavior.

#### Vibyra features

- Add one compact row: `Chat and voice typing` with `Ready` or `Set up` status.
- Explain the distinction in one sentence only when setup opens: “This uses
  your own OpenAI API key; terminal accounts above are separate.”
- When unconfigured, `Set up` expands a two-step panel: open the OpenAI key page,
  then paste and verify the key. Mention API billing in one short line.
- When configured, show the masked key hint, `Manage`, and confirmed `Remove`.
- Keep the secure-storage warning visible when the keyring is unavailable.
- Show compact usage and current spend-cap summaries only inside `Manage`.
- Put the detailed usage breakdown, pricing explanation, request caps, spend
  caps, and always-on guard explanation behind `Usage and limits`.
- Keep daily/monthly spend caps prominent inside that disclosure because they
  protect money. Preserve native enforcement and on-disk counters.

#### Remove from the default page

- Hide the healthy OpenRouter catalog row. The catalog is automatic, not a user
  preference. Show a small recovery row only when refresh is stale or failed;
  keep manual Refresh in Advanced diagnostics.
- Move Additional runtimes to Advanced > Runtimes.
- Model selection remains at terminal launch, not in Settings.

### Notifications

The default page should initially show three decisions:

- `Show notifications`
- `Play sounds` with the compact volume control shown only when enabled
- `Desktop notifications` with an explicit Enable action when permission has
  not been granted

`Only notify me when Vibyra is in the background` should appear as a dependent
row only when desktop notifications are enabled.

Add one collapsed `Customize notifications` disclosure for event-level choices.
Inside it:

- Use a clear channel choice (`In Vibyra` or `In Vibyra and on desktop`) instead
  of an unexplained monitor icon.
- Keep the event switch and cue selection, but show the cue selector only when
  both the event and sounds are enabled.
- Group frequent events first: Agent needs you, Agent finished, Agent failed,
  and Spend limits.
- Put Preview, Performance, New models, and App problems under `More events`.
- Keep app-problem behavior safe; if it remains individually locked, explain
  the reason next to that row only.

### Shortcuts

- Keep only the two editable global shortcuts in the default view.
- Rename `Speech to terminal` to `Voice typing` and `Screenshot editor` to
  `Screenshot`.
- The recorder button should say the current shortcut and expose “Change” on
  hover/focus; show recording instructions only while recording.
- Replace the six static app-control rows with one `View all keyboard
  shortcuts` disclosure or command-palette help action.
- Preserve duplicate-shortcut validation, Escape cancellation, Delete reset,
  and global shortcut suspension while recording.

### Account

- Remove the introductory paragraph and the duplicated Account/Profile blocks.
- Show name, email, provider, and plan in one compact summary.
- Show verification status only when action is required; a verified badge adds
  no task for the user.
- Use `Edit profile` to reveal editable fields rather than showing a permanent
  form. Keep provider-managed email disabled with a short provider label.
- Keep password reset only for eligible email/password accounts.
- Keep Log out at the bottom. Preserve the running-terminal confirmation and
  the secure-session/keyring warning.

### Advanced

Advanced is a secondary page with collapsed groups. Opening a contextual link
should reveal and focus the relevant group.

#### Terminal

- Font family: provide detected/common monospace choices plus `Custom`.
- Scrollback: use presets such as 1,000, 5,000, 10,000, and 50,000, with Custom
  for existing non-preset values.
- Default shell: show `System default`, detected shells, and Custom. Do not lead
  with a raw `/bin/...` input.

#### Files and screenshots

- Rename Workspace root to `Default project folder` and use a native folder
  picker. Preserve a custom existing path.
- Rename Screenshot folder to `Save screenshots to` and use a folder picker.
- Rename `Vibyra in captures` to `Include the Vibyra window`, using a normal
  switch. Put compositor requirements in contextual help, not the row.

#### Graphics

- Show the active mode and `Automatic` as the recommended default.
- Hide Accelerated and Compatibility choices behind `Override automatic mode`.
- Keep environment-override and restart-required messages visible only when
  applicable.
- Update performance-warning actions to open Advanced > Graphics directly.

#### Runtimes

- Move Additional runtimes and Custom agents into one expert area.
- Show installed runtimes before unavailable ones; collapse unavailable rows.
- Put `Add custom agent` behind an action that reveals the form.
- Label fields in user language but retain program, arguments, and generated ID
  compatibility. Explain PATH only beside Program when the field is focused.
- Preserve removal and provider/runtime synchronization behavior.

## Item Disposition

| Current item | Decision | New location |
| --- | --- | --- |
| Theme cards | Simplify | General, segmented control |
| Font size | Keep | General, preset/stepper |
| Restore terminal output | Keep and shorten | General, Privacy |
| Font family | Move and simplify | Advanced > Terminal |
| Scrollback | Move and simplify | Advanced > Terminal |
| Default shell | Move and simplify | Advanced > Terminal |
| Workspace root | Rename and use picker | Advanced > Files |
| Screenshot folder | Rename and use picker | Advanced > Files |
| Vibyra in captures | Rename and shorten | Advanced > Files |
| Graphics mode | Move behind override | Advanced > Graphics |
| Notification master/sound/desktop | Keep | Notifications |
| Per-event cue/channel matrix | Collapse | Notifications > Customize |
| Vibyra AI key | Merge destination, preserve ownership | AI accounts > Vibyra features |
| AI usage and limits | Collapse, preserve safeguards | AI accounts > Vibyra features |
| Provider accounts | Keep and compact | AI accounts > Terminal accounts |
| OpenRouter healthy status | Remove from default | Error recovery or Advanced |
| Additional runtimes | Move | Advanced > Runtimes |
| Custom agents | Move and collapse form | Advanced > Runtimes |
| Global shortcuts | Keep and shorten | Shortcuts |
| Static app shortcut list | Collapse/relocate | Shortcut help |
| Profile/account forms | Compact and reveal on edit | Account |

## Copy Reduction Specification

Remove:

- every page-header blurb in `SECTIONS`;
- the sidebar autosave footer;
- Profile, Integrations, and Custom-agent lead paragraphs;
- hints that merely restate a label;
- the permanently visible four-step key tutorial;
- the permanently visible AI “What it powers”, always-on guard list, and full
  list-price paragraph;
- the healthy OpenRouter explanation;
- the permanent in-app shortcut reference list.

Keep or show conditionally:

- secure-storage/keyring failures;
- provider-managed email restrictions;
- running-terminal logout confirmation;
- provider disconnect confirmation;
- notification-permission denial recovery;
- spend-cap consequences and external billing-record distinction;
- saved-terminal-history privacy consequences;
- graphics restart and environment-override messages.

Default copy constraints:

- one title per page;
- at most one introductory sentence per group;
- row hints only for a non-obvious consequence;
- no primary hint longer than two short lines at 860 px;
- technical names such as DMA-BUF, shared memory, PATH, token prices, and raw
  model IDs appear only in Advanced, expanded help, or actionable errors.

## State And Persistence Plan

1. Add `saveState: "idle" | "saving" | "saved" | "error"` and
   `saveError` to `settingsStore.ts`.
2. Keep an immediate update path for switches, theme, and safe segmented
   controls.
3. Add a commit/debounced path for text and numeric values so incomplete edits
   are not written on every keystroke.
4. On save failure, restore or clearly mark the unsaved value and keep the error
   visible until the next successful save or dismissal.
5. Keep Settings.json field names and Rust defaults unchanged during this UI
   redesign. Existing settings should render correctly without migration.
6. Keep secrets outside Settings.json. No renderer state may gain provider
   tokens, browser-auth details, or the full OpenAI key.
7. Introduce a contextual target shape for deep links, for example section plus
   optional panel. Map existing callers to the new destinations.

Suggested section IDs:

```ts
type SettingsSectionId =
  | "general"
  | "aiAccounts"
  | "notifications"
  | "shortcuts"
  | "account"
  | "advanced";

type SettingsPanelId =
  | "terminalAccounts"
  | "vibyraFeatures"
  | "terminal"
  | "files"
  | "graphics"
  | "runtimes";
```

## Component And File Plan

### Shell and shared controls

- Refactor `components/settings/SettingsModal.tsx` to the new order, remove
  blurbs/footer, render the secondary Advanced link, and support panel targets.
- Extend `state/workspaceStore.ts` for section plus optional panel targeting.
- Extend `state/settingsStore.ts` with save feedback and commit semantics.
- Refine `SettingsShared.tsx` with a compact row, disclosure group, segmented
  control, field commit wrapper, and save-state announcer. Split these into
  focused files if the 200-line limit would be exceeded.
- Move shell-specific CSS from `modals*.css` into a focused settings-shell file
  if needed; do not create another broad stylesheet.

### Page ownership

- Simplify `SettingsGeneralPane.tsx` to Appearance and Privacy.
- Add `SettingsAiAccountsPane.tsx` as the coordinator for provider accounts and
  Vibyra-feature setup. Reuse `ProviderAccountRow.tsx` and a compacted
  `OpenAiKeyCard.tsx`.
- Retire `SettingsAiPane.tsx` and `SettingsIntegrationsPane.tsx` only after all
  deep links and tests point to the combined coordinator.
- Simplify `SettingsNotificationsPane.tsx`; keep event configuration in an
  extracted `NotificationEventSettings.tsx` disclosure.
- Simplify `SettingsShortcutsPane.tsx`; extract all-shortcuts help only if it is
  kept inside Settings.
- Rename or replace `SettingsProfilePane.tsx` with `SettingsAccountPane.tsx`.
- Add `SettingsAdvancedPane.tsx` as a small coordinator. Reuse or extract
  `GraphicsCard.tsx`, `TerminalIntegrations.tsx`, and the custom-agent editor
  into focused advanced groups.
- Keep every first-party source file at or below 200 physical lines.

### Contextual callers to update

- `components/companion/ChatPanel.tsx` -> AI accounts > Vibyra features.
- `components/agents/AgentPickerModal.tsx` and
  `components/rail/LaunchSettings.tsx` -> AI accounts > Terminal accounts or
  Advanced > Runtimes.
- `components/notifications/NotificationBellHost.tsx` -> Notifications.
- `components/layout/AccountMenu.tsx` -> Account.
- `lib/notificationActions.ts` graphics/AI/shortcut actions -> the new target.
- Update `tests/launchIntegrationsCta.test.mjs` after the routing change.

## Responsive And Accessibility Requirements

- Keep the sidebar at normal desktop widths. Below 700 px, replace the
  horizontally scrolling nav with one section-menu button in the header.
- Stack label/control rows below 560 px; never truncate the active setting or
  require horizontal page scrolling.
- Preserve dialog focus trapping, Escape/backdrop close, visible focus styles,
  and close-button labelling.
- Keep radio groups, switches, meters, disclosures, and status messages
  semantically announced.
- Announce save state and async provider/key actions through polite live regions;
  errors use alert semantics.
- When a deep link reveals a panel, move focus to its heading without stealing
  focus during ordinary navigation.
- Verify dark, light, reduced-motion, keyboard-only, 860 x 600, and narrow
  layouts.

## Implementation Sequence

### Phase 1: Shell, routing, and save behavior

1. Add the new section/panel target types and update Settings entry points.
2. Build the five-primary-plus-Advanced shell with the existing pages still
   mounted behind temporary adapters.
3. Add save-state feedback and commit semantics before changing field layouts.
4. Add shell, routing, focus, and save-failure tests.

Checkpoint: every old destination still opens the equivalent new location;
changing a setting either confirms success or exposes failure.

### Phase 2: General and Advanced

1. Reduce General to theme, text size, and terminal-history privacy.
2. Build Advanced groups and relocate terminal, folder, screenshot, graphics,
   runtime, and custom-agent controls without changing persisted fields.
3. Replace raw paths and common numeric values with pickers/presets while
   preserving Custom fallbacks.
4. Update graphics-warning and runtime-launch deep links.

Checkpoint: old values round-trip exactly; General fits without scrolling;
expert controls remain reachable in two clicks.

### Phase 3: AI accounts

1. Build the combined coordinator with distinct Terminal accounts and Vibyra
   features groups.
2. Compact provider rows without changing native provider-auth calls.
3. Collapse API-key setup, usage, and limits; keep credential and billing
   warnings conditional.
4. Hide healthy catalog diagnostics and expose recovery only on failure.
5. Remove retired page/style modules after references and tests are clean.

Checkpoint: a new user can distinguish provider browser login from the Vibyra
OpenAI key; connect, cancel, fallback URL, disconnect, verify, replace, and
remove flows still work.

### Phase 4: Notifications, Shortcuts, and Account

1. Reduce Notifications to the three default decisions and move the matrix into
   Customize.
2. Reduce Shortcuts to two editable bindings plus optional help.
3. Compact Account and reveal profile/password edits only on request.
4. Preserve all confirmation, denial, busy, success, and error states.

Checkpoint: each default page is scannable in one viewport and safety states
remain explicit.

### Phase 5: Visual and interaction polish

1. Remove obsolete copy and CSS.
2. Implement the narrow section menu and stacked rows.
3. Audit tab order, accessible names, disclosure state, and live announcements.
4. Capture paired wide/narrow and dark/light screenshots for review.

## Validation Matrix

Automated:

```bash
npm --prefix desktop-tauri run typecheck
npm --prefix desktop-tauri test
npm --prefix desktop-tauri run build
npm --prefix desktop-tauri run core:test
node scripts/check-desktop-lines.mjs
```

Targeted behavior checks:

- each old contextual action opens the correct new section/panel;
- theme and terminal text apply live;
- committed text/numbers save once and survive restart;
- a simulated settings-save failure is visible and does not imply success;
- notification permission is requested only from the explicit Enable action;
- notification dependencies disable correctly;
- provider connect/cancel/open-page/disconnect states remain correct;
- API key verify/replace/remove and unavailable-keyring states remain correct;
- spend limits still reject a request before it is sent;
- running-terminal logout still asks for confirmation;
- shortcut recording, collision, reset, Escape, and focus cleanup still work;
- graphics overrides still require restart and respect environment overrides;
- custom agent add/remove and enabled-runtime synchronization still work;
- existing Settings.json values load without migration or data loss.

Visual/manual:

- dark and light at the current 860 x 600 modal size;
- narrow window below 700 px with no horizontal navigation or page overflow;
- long email, provider status, custom shell/path, 200% text zoom, and error copy;
- keyboard-only traversal and screen-reader names for every control;
- default General, AI accounts, Notifications, Shortcuts, and Account pages do
  not expose expert diagnostics before the user asks for them.

## Acceptance Criteria

- The primary sidebar has five clear destinations; Advanced is visually
  secondary.
- General fits in one viewport and contains no more than three decision groups.
- AI accounts shows provider status and Vibyra-feature status above the fold;
  setup, usage detail, and diagnostics are collapsed.
- Notifications initially shows only global, sound, and desktop decisions.
- Shortcuts initially shows only the two editable global tools.
- Account does not show verified-state or editing UI unless it needs action.
- Healthy OpenRouter catalog details, raw renderer terminology, raw path/font
  stacks, per-event cue matrices, and custom-agent forms are absent from the
  default path.
- All permission, destructive-action, billing, privacy, and credential-storage
  safeguards listed in this plan remain explicit.
- Save failures are visible; the interface never claims persistence without a
  successful native save.
- Existing settings and secrets require no migration and suffer no data loss.
- The full automated validation set passes, the line gate reports no first-party
  file over 200 lines, and wide/narrow dark/light screenshots are approved.

## Explicit Non-Goals

- Do not change provider authentication, OpenAI key storage, billing ownership,
  native spend enforcement, notification event generation, or terminal launch
  policy.
- Do not put model selection back into Settings.
- Do not add onboarding tours, dashboards, new permanent cards, or more copy to
  explain the simplified design.
- Do not remove advanced capabilities or persisted fields merely because they
  are hidden from the default path.
