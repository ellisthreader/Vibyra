# Vibyra Mobile Quiz — Snapshot (2026-05-15)

Captured before redesign. Source of truth: `/src/screens/OnboardingScreen.tsx` + `/src/screens/onboarding/**`.

## Routing gate
`App.tsx` → if `!authenticated` show `<AuthScreen>`. Else if `!onboardingComplete` show `<OnboardingScreen>`. Else `<WorkspaceScreen>`.

## OnboardingScreen step machine
`step: 0..7`, plus a `momentStep` interstitial that overlays between answers.

| step | Component                          | Purpose                                                              |
|------|------------------------------------|----------------------------------------------------------------------|
| 0    | FrequencyQuestionScreen            | "How often will you code with Vibyra?" (rarely / occasionally / few times / every day) |
| 1    | QuestionScreen (intent, multi)     | "What are you building?" — exploring, learning, side_project, app_website, work, automation |
| 2    | QuestionScreen (device)            | "What devices will you use?" — phone, phone_computer, computer, other |
|  ↳   | QuestionMomentScreen               | Interstitial after step 2 — sells the device flow                    |
| 3    | UsageSlider (depth)                | "How much will you build?" — light / steady / heavy / max            |
| 4    | IdentityQuestion                   | beginner / student / developer / founder_freelancer (selecting auto-advances to 5) |
| 5    | ProfileGeneratingScreen → InsightScreen | 1.9s "generating" animation, then persona reveal                 |
| 6    | PricingScreen                      | Paywall (Starter/Builder/Pro × monthly/annual)                       |
| 7    | SetupScreen (existing PC connect)  | **Dead code today**: `finishOnboarding` flips `onboardingComplete=true` AND sets step=7, but App.tsx routes to Workspace first |

## Persona output
`calculatePersona(answers)` returns one of: `idea_explorer`, `learning_builder`, `hobby_builder`, `side_project_builder`, `app_builder`, `workflow_automator`, `product_developer`, `power_engineer`. Drives recommended plan in pricing.

## Existing connect step (SetupScreen)
Lives at `src/screens/onboarding/steps/SetupScreen.tsx`. Sub-steps 1–4:
1. Download Vibyra Desktop
2. Choose Auto/Manual → Find PC or enter code (ConnectStepTwo)
3. Approve on PC → "Confirm on phone"
4. "You're connected"

Uses `app.discoverPairableDesktops`, `app.pairMachine`, `app.pairMachineAt`, `app.confirmPhonePermission`. Backdrop `front-page-nebula.png`. Glow loop on logo. Currently unreachable post-paywall purchase because `usePricingPurchase` already sets `onboardingComplete=true`.

## State surfaces we'll need
- `app.authName` (welcome by name)
- `app.discoverPairableDesktops`, `app.pairMachine`, `app.pairMachineAt`, `app.pairCode`, `app.setPairCode`
- `app.pairing`, `app.pairingError`, `app.pairingMessage`, `app.healthMessage`, `app.checkingHealth`
- `app.pendingPhoneApproval`, `app.confirmPhonePermission`
- `app.rememberedDesktops`, `app.paired`
- `app.completeOnboarding()` — currently called from both `OnboardingScreen.finishOnboarding` and `usePricingPurchase` on successful buy. Will move ownership to the new welcome+connect screen.

## Files we will touch (read or edit)
- `App.tsx`
- `src/screens/OnboardingScreen.tsx`
- `src/screens/onboarding/steps/SetupScreen.tsx` (will be retired in favour of new flow)
- `src/screens/onboarding/steps/usePricingPurchase.ts` (stop calling completeOnboarding here)
