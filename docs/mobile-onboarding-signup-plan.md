# Mobile onboarding and sign-up plan

Target app: `mobile/` in the `Desktop/Vibyra-iOS` checkout — the Expo SDK 57
client you run with `npm run phone` in Expo Go. **Not** the legacy root `src/`
Expo client, and not `desktop-tauri/`.

Status: implemented on 7 September 2026. Decisions taken: D1 ship the welcome
flow first with an honest "Rolling out" phone card (no cloud-AI runtime yet),
D2 email and password only (Expo Go keeps working), D3 skipping stays free.
Code lives in `mobile/src/onboarding/`, `mobile/src/account/` and
`mobile/src/transport/deviceFlags*.ts`; the gate is in `WorkspaceApp.tsx`.
The home screen carries no phone-mode copy because `WorkScreen` and
`NewChatComposer` stayed untouched; the honesty lives on card B itself.

## 1. What exists today

`mobile/App.tsx` mounts `WorkspaceApp` immediately. There is no first-run
screen, no account, and no `mobile/src/onboarding/` directory. The first thing
a new user sees is the composer home (`src/ui/WorkScreen.tsx`) with a
"Connect your computer" card, and their only route forward is the pairing sheet
(`src/ui/ConnectScreen.tsx`) or the sample workspace hidden in Settings.

The app has no concept of a Vibyra account. The backend already does:
`POST /api/auth/signup`, `POST /api/auth/login`, provider challenge/login for
Apple and Google, password reset, and `GET /api/session` — all in
`backend/routes/web.php`, returning `{ ok, token, user }` from
`Concerns/UserPayloads::sessionPayload`. Signup needs `email` plus a password of
at least 8 characters and returns HTTP 201 with `isNewUser: true`. None of this
is wired into `mobile/`.

Design constraints already recorded for this app, which this plan obeys:

- `Vibyra/_ai/App/iOS Remote Workspace.md` and `.agents/skills/plan/SKILL.md`:
  "Do not restore lesson copy or an onboarding/sample dashboard." A **one-time
  first-run gate is not an onboarding dashboard on the home** — the home screen
  stays exactly as it is. This plan adds nothing permanent to the home.
- Every source, test and script file stays at or under 200 lines
  (`mobile/scripts/check-lines.mjs`).
- `mobile/scripts/ui-test-helpers.mjs` fails any captured screen containing
  `lesson`, `course`, `tutorial`, `learning path` or `start learning`, and fails
  any screen with horizontal overflow. Onboarding copy must clear both.
- Native trust lives in SecureStore; the browser runtime keeps keys in memory
  and may persist only non-secret flags in `localStorage`.

## 2. Explicitly out of scope

Untouched, by request and by design:

`src/ui/WorkScreen.tsx`, `src/ui/NewChatComposer.tsx`,
`src/ui/NavigationDrawer.tsx`, `src/ui/SessionScreen.tsx`,
`src/ui/Composer.tsx`, `src/theme.ts`.

`ConnectScreen.tsx` is **reused unchanged** — the onboarding opens the existing
pairing sheet rather than growing a second one.

## 3. The flow

Three full-screen steps, shown once, before the workspace mounts. Each step is
skippable forward; the whole flow can be reopened from Settings.

### Step 1 — Welcome

- `BrandMark` at 56, then a two-line hero in the home screen's exact type
  (35 / 42, weight 500, letter-spacing -1.2): **"Build from your pocket."**
- Three quiet icon + one-line rows. No cards, no dashboard:
  - `flash-outline` — "Describe what you want. An agent writes the code."
  - `desktop-outline` — "Run real terminals on your own computer."
  - `eye-outline` — "See exactly what changed before it lands."
- Primary `Button` "Get started".
- Text link "I already have an account" → step 2 in log-in mode.
- Muted legal line linking `vibyra.app/legal/terms` and `/legal/privacy`.

### Step 2 — Account (skippable)

- Header "Create your Vibyra account". Sub-line: "Keeps your chats, and unlocks
  coding on your phone. You can do this later."
- Email + password fields, password minimum 8 characters to match the backend.
- Primary `Button` "Create account", busy state through the existing
  `useAction` hook.
- Toggle link "Log in instead" ⇄ "Create an account instead".
- **"Skip for now"** — a visible secondary text button directly under the
  primary. Not buried, not a back-gesture.
- Errors render through `Hint error` using the backend's own message string
  verbatim (`{ ok: false, error }`), so "An account already exists for that
  email. Log in instead." reaches the user as written.

### Step 3 — Choose how you code

Header "How do you want to code?" Sub-line "You can switch any time."
Two stacked cards — stacked, not side-by-side, because they must not overflow
375 px.

**Card A — Connect your computer** (marked "Recommended", `desktop-outline`)

- Run several terminals at once
- Live preview of what you are building
- Your real projects, files and git history
- Claude Code or Codex running on your own machine

CTA "Connect computer" → opens the existing `ConnectScreen`. On a successful
pair, onboarding completes and lands on the workspace.
Footnote: "Needs Vibyra Host running on your computer."

**Card B — Code on this phone** (`phone-portrait-outline`)

- Chat with an AI and build straight from your phone
- Nothing to install — works anywhere you have signal
- No computer needed

CTA "Start on phone".
Footnote: "Needs a Vibyra account." If the user skipped step 2, this returns
them to step 2 with that one-line reason shown, then continues.

Tertiary link below both: "Skip — I'll decide later" → completes onboarding and
lands on the normal home, which already carries its own Connect card.

### After completion

`onboarding` is persisted and `WorkspaceApp` renders exactly as it does today.

## 4. Decisions to confirm before Phase 1

**D1 — Does "code on this phone" actually work when this ships?**
No, not from this plan alone. The backend has `/api/chat` and
`/api/chat/stream`, but the new `mobile/` client has no cloud-AI path at all —
every session today is hosted by the paired computer.
*Recommendation:* ship the onboarding first and make card B honest — it records
the choice, requires an account, and lands on a home whose composer says
"Phone coding is rolling out. Connect a computer to start now." Then wire
`/api/chat/stream` as an immediate follow-on plan (roughly 4–6 new files:
transport, streaming reader, credit/error handling, a phone-mode session kind).
*Alternative:* fold the phone runtime into this plan and roughly double it.

**D2 — Apple and Google sign-in?**
`expo-apple-authentication` and `@react-native-google-signin` are native
modules that **do not run in Expo Go**. Adding them ends your current Expo Go
workflow until a development build exists.
*Recommendation:* email and password only now — the backend supports it today —
and add the provider buttons when the dev build lands. The backend's
`/api/auth/provider/challenge` and provider login are already there waiting.

**D3 — Is skipping genuinely free?**
Yes for the computer path: pairing is account-free by design today and this plan
does not change that. The phone path needs an account because `/api/chat` is
token-gated and credit-metered. So skipping never blocks the main product.

## 5. State and persistence

Extend `RuntimeState` in `src/state/types.ts`:

```ts
onboarding: { status: 'unknown' | 'pending' | 'complete'; mode: 'computer' | 'phone' | null };
account: { email: string; name: string; plan: string } | null;
```

`status: 'unknown'` matters. `initialize()` is async and the UI renders before
it resolves; without this the onboarding would flash on every cold start for
users who finished it months ago. While `unknown`, render the brand splash.

Storage, through the existing `SecureStorage` interface:

| Key | Contents | Secrecy |
| --- | --- | --- |
| `onboarding` | `{ completedAt, mode }` | non-secret |
| `account` | `{ token, email, name }` | secret — SecureStore only, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |

New `src/transport/deviceFlags.ts` and `deviceFlags.web.ts` so the non-secret
onboarding flag survives a browser reload via `localStorage`, while the session
token stays memory-only on web. This matches the rule already documented for
this app. A storage failure must let the user in with a notice, never trap them
on the gate.

## 6. Files

### New

| File | Approx. lines | Purpose |
| --- | --- | --- |
| `mobile/src/onboarding/OnboardingFlow.tsx` | 90 | Step orchestration and completion |
| `mobile/src/onboarding/OnboardingScaffold.tsx` | 60 | Shared safe-area frame, scroll, progress dots |
| `mobile/src/onboarding/WelcomeStep.tsx` | 80 | Step 1 |
| `mobile/src/onboarding/AccountStep.tsx` | 120 | Step 2 |
| `mobile/src/onboarding/PathStep.tsx` | 90 | Step 3 |
| `mobile/src/onboarding/PathCard.tsx` | 70 | One benefit card |
| `mobile/src/account/accountApi.ts` | 90 | signup / login / session |
| `mobile/src/account/accountActions.ts` | 90 | Store actions |
| `mobile/src/transport/deviceFlags.ts` + `.web.ts` | 15 each | Non-secret flag storage |
| `mobile/tests/onboarding.test.ts` | 120 | State machine, skip, resume, storage failure |
| `mobile/tests/accountApi.test.ts` | 90 | Contract and error mapping, mocked fetch |

### Edited, surgically

- `src/state/types.ts` — the two state fields
- `src/state/connection.ts` — `initialize()` reads the two new keys
- `src/state/WorkspaceStore.ts` — wire the new actions
- `src/ui/types.ts` — `WorkspaceModel` and `WorkspaceActions` additions
- `src/ui/WorkspaceApp.tsx` — **the gate, about six lines**; the only structural
  edit to an existing screen
- `src/ui/SettingsScreen.tsx` — an "Account" row (sign in / email + sign out)
  and a "Show welcome again" row. It is ~95 lines today; if the additions push
  it near 200, split `src/ui/AccountSettings.tsx` out
- `src/demo/useDemoWorkspace.ts` — satisfy the widened model
- `mobile/app.config.ts` — `extra.apiUrl`
- `mobile/scripts/verify-ui.mjs`, `verify-host-ui.mjs` — see risk R1

### Documentation to update on completion

`docs/ios-mobile-implementation-status.md`,
`Vibyra/_ai/App/iOS Remote Workspace.md`, `.agents/skills/plan/SKILL.md` —
record that a one-time first-run gate is permitted and that the no-dashboard
rule still governs the home screen, so a future agent does not delete this work
as a rule violation.

## 7. Visual consistency

Everything reuses what the app already has: `palettes` / `ThemeContext` tokens,
`Button`, `Hint`, `Icon`, `SectionLabel`, `BrandMark` from `src/ui/primitives`.

- Hero type copies `WorkScreen` exactly: 35 / 42, weight 500, tracking -1.2.
- Cards copy the home Connect card: radius 20, `StyleSheet.hairlineWidth`
  border on `colors.border`, `colors.surface` fill, 14 padding.
- Buttons stay at the primitive's 52 min-height, radius 18.
- Every touch target is at least 44 pt.
- Light, dark and system all correct — colours come only from tokens.

## 8. Phases

0. Confirm D1–D3.
1. State, persistence, `deviceFlags`, unit tests. No UI. `npm run check` green.
2. `accountApi` + actions + contract tests against mocked fetch.
3. The three steps and the `WorkspaceApp` gate.
4. Settings rows.
5. Verification scripts updated, full gate run, Expo Go on the physical iPhone.

Each phase ends green before the next begins.

## 9. Risks

**R1 — the gate breaks both verification scripts.** `verify-ui.mjs` and
`verify-host-ui.mjs` both `page.goto(url)` and then immediately wait for the
composer. A first-run gate makes every one of the 60+ current captures fail.
Both scripts must dismiss the gate in the same change. This is the single most
likely thing to be missed.

**R2 — banned copy.** `capture()` runs `noTutorialFraming` on every screenshot.
Avoid lesson, course, tutorial, learning path, start learning.

**R3 — horizontal overflow.** `capture()` also asserts none. Benefit cards must
be verified at 375 px before anything else.

**R4 — ARIA state.** The plan skill records that `accessibilityState` alone did
not produce `aria-checked` in this web runtime. Path selection must set real
`aria-*` props alongside the native ones, or the accessibility assertions fail.

**R5 — first-run flash.** Covered by `status: 'unknown'`, but it must actually
be implemented, not assumed.

**R6 — widened model breaks the demo.** `useDemoWorkspace` constructs a
`WorkspaceModel` by hand and will fail typecheck until updated.

**R7 — the 200-line gate.** `AccountStep` and `SettingsScreen` are the two
files most likely to breach it.

## 10. Verification

- `cd mobile && npm run check` — assets, typecheck, tests, 200-line gate
- `npm run verify:ui` extended with an onboarding journey: welcome, account and
  path captured at 375×667 and 430×932 in light and dark; the skip path; the
  account-required path from card B; and resume-after-reload proving the flag
  persisted
- `npm run verify:host-ui` — regression, gate dismissed first
- `npm run export` — iOS and web bundles
- Expo Go on the physical iPhone via `npm run phone`, using the new
  "Show welcome again" Settings row to reproduce a true first run
- Capture gallery under `tmp/ios-onboarding/`

Browser captures are not evidence of native keyboard, Keychain or lifecycle
behaviour. The Expo Go pass on the real phone is the one that counts.
