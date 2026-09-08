# iOS implementation status

Updated 7 September 2026. This records the foundation and conversation-first redesign of
the [master plan](ios-mobile-master-plan-2026-2027.md), not completion of M0–M5.

## Baseline and plan review

Work is based on the dedicated `Vibyra-iOS` checkout, baseline commit `6f19d10`.
Its existing `mobile/` and `host/` work was retained. `Desktop/SaaS` is an older
checkout and is not the target for this app. Legacy mobile `src/`, Laravel,
and the desktop UI were not migrated in this increment.

The plan's main recommendation remains sound: phone UI, computer-owned
execution, and one task across devices. Its M1/M2 security and persistence
work remains prerequisite to a public service. A terminal process is not a
structured agent job; the existing Host exposes no structured approval adapter.

## Delivered foundation

| Area | Implemented behavior |
| --- | --- |
| Frontend | Coding composer home; searchable chat/terminal sidebar; compact project/computer context; Graphite/Cobalt light, dark and system appearance |
| Sample workspace | Optional Settings entry with visible sample label; coding conversations, inline decisions, file review and isolated sample terminal output |
| Connection | Bundled maintained Noise client, pinned host key, short-lived invitation, explicit local Host approval, saved native trust and reconnect |
| State | Host identity checks, stale-connection fencing, session selection isolation, UTF-8 offset reconciliation and bounded output |
| Terminal | Bundled isolated xterm renderer; ANSI/Unicode, observation, explicit input control, lease/generation checks, stop and resize |
| Files | Host-authorized project browsing, text reads and colored current-working-tree diff |
| Build | Completed entry point, SDK-matched dependencies, generated asset pipeline, native/web export and focused tests |

## Conversation-first redesign

The product is a remote vibe coding workspace, not a teaching app. The original
welcome page and sample dashboard have been removed. The primary home is a
coding composer with direct computer connection and terminal/project actions.
The sidebar searches session titles and project names, filters chats and
terminals, and lets users switch without losing unsent session drafts.

New chat creation chooses a real Host project and Claude Code, Codex or Terminal.
The home prompt moves to the newly created session as an unsent draft; it never
automatically executes during connection or provider selection. Live agent Chat
renders the real CLI terminal stream. Session options contain stop/details, and
files/changes stay tied to the active project. Terminal accessory keys obey the
same input control lease. Project, computer, connection and settings screens use
compact lists and quiet controls. Optional sample access lives only in Settings.

This redesign does not implement Desktop-to-Host IPC: existing chats from the
Vibyra Desktop app are not yet synchronized into this client. Real sessions here
are hosted by the standalone Host. Structured sample messages, results and
previews do not establish those capabilities for live Desktop sessions.

The local redesign verification captures show the new home,
conversation, sidebar, terminal and session creation surfaces. Redesign
verification covers 60 current captures across all four compact/large light/dark
journeys, rendered radio/tab accessibility states, modal background isolation, draft handoff,
message/output isolation, inline decisions, preview feedback and navigation.
The real Host UI check passed two independent terminals/drafts, actual command
file effects, diff/file reads, reconnect, observation, input control and stop.

## First-run welcome and account

Added 7 September 2026 from
[the onboarding plan](mobile-onboarding-signup-plan.md). A fresh install now
shows a one-time flow before the workspace mounts: a welcome screen, an
optional email/password account step with a visible "Skip for now", and a
"How do you want to code?" choice between connecting a computer (recommended;
opens the existing pairing sheet, and a successful pairing finishes the flow)
and coding on the phone (records the choice and needs an account; labeled
"Rolling out" because this client still has no cloud-AI runtime). A tertiary
"decide later" link lands on the unchanged home. The flow can be reopened from
Settings ("Show welcome again"), which also gained an Account section.

State persists as a non-secret `onboarding` flag (Keychain-backed on native,
`localStorage` on web) and a secret `account` record holding the session token
(SecureStore only; memory on web). A storage failure lets the user in with a
notice rather than trapping them on the gate. Accounts use the existing
`/api/auth/signup`, `/api/auth/login`, `/api/session` and `/api/auth/logout`
endpoints; backend error messages reach the user verbatim. Apple and Google
sign-in were deliberately left out so Expo Go keeps working. Pairing a
computer still needs no account.

## Validation

Host: 26 tests, Clippy with warnings denied, 200-line engine gate, WASM build,
and WASM-to-native integration passed. Integration exercised pairing approval,
actual shell output, file reads, retained session on reconnect, stop and revoke.

Mobile: 37 focused tests (9 covering onboarding state, storage failure,
account restore and the auth API contract) and all 21 Expo Doctor checks passed, alongside
typechecking, isolated terminal rendering/Unicode/control checks,
source-line checks, iOS and web exports, Expo dependency validation, and browser
interaction captures on 375×667 and 430×932 in both themes. See the executable
`mobile/scripts/verify-*.mjs` checks for the exact journeys. The welcome flow,
login/sign-up validation, the account-required phone path, the dismissed gate
surviving a reload and the Settings account sheet are captured under
`tmp/ios-onboarding/`; the real Host check pairs from inside the flow and
asserts it completes.

`npm audit` reports 10 moderate transitive Expo/build-tool advisories (including
`uuid` via `xcode`); its proposed full fix downgrades Expo to an incompatible
major version. No forced SDK downgrade was applied. These remain part of the
production dependency review, alongside the other open release gates.
The real UI-to-Host check also passed pairing approval, a shell-generated file,
working-tree diff and file reads, reconnect to the same session, observation,
explicit control and process stop. No paid/live AI provider call was required.

The [rendered review gallery](../tmp/ios-ui-review/index.html) contains 56 captures
covering both themes and compact/large phone layouts, including reduced-motion,
short-viewport composer, and landscape terminal states.

Browser screenshots are visual checks of shared UI, not proof of native iOS
keyboard, accessibility, Keychain or background behavior.

## Remaining release work

1. Account-bound grants, project/device scopes, revocation freshness and a
   reviewed crypto architecture decision; independently review the existing
   Noise choice against the plan's transport spike.
2. Desktop-to-Host IPC, one execution authority and qualified user-service
   installation on every advertised OS.
3. Structured provider capabilities, exact approvals, durable ordered events,
   task-owned artifacts/test evidence and retry-safe Git actions.
4. Encrypted preview transport, attachments, persistent encrypted drafts,
   notification privacy and dictation.
5. Real iPhone LAN/mobile-data, keyboard/IME, background/reconnect and battery
   evidence; macOS/Windows/Linux qualification; signed builds, account/billing,
   store assessment, independent security review and design-partner validation.

The current trust model grants a paired device computer-user shell authority.
Project-root restrictions on file reads do not sandbox a terminal. All rich
demo results remain examples; no live provider success is inferred from them.
