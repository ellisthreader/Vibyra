# Welcome+Connect — Final Plan (post-review)

Synthesis of all 6 subagent reviews.

## Steps (collapsed from 5 to 4)
1. **Hero** — "Welcome, {firstName}" + animated logo + nebula + "Let's get started" CTA + discreet "Skip for now" pill.
2. **Setup** — Single screen: copy "Get Vibyra Desktop at vibyra.ai" + radar pulse auto-discovery + tap-to-pair list + "Use a code" fallback tab. No self-attestation "I downloaded it" button — discovery itself is proof.
3. **Approve** — "Tap Allow on your computer" + handshake animation. After 30s show "Didn't see it? Try again" link back to Setup. Confirmation sheet only here.
4. **Connected** — Sparkle burst + spring checkmark. Auto-advance at 2.4s OR user taps "Enter workspace" CTA.

Skip-pill copy is "Skip for now" everywhere; sheet inside Approve uses "Skip PC setup?" / "Skip".

## Routing gate — uses local-only `pcSetupComplete` flag

- New flag `pcSetupComplete: boolean` added to `PersistedSession` + `PersistedUser`. **Local-only**: not sent to backend, ignored on incoming `RemoteUser` payloads so backend cannot flip it.
- `App.tsx` gate becomes `if (!app.onboardingComplete || !app.pcSetupComplete) return <OnboardingScreen>`.
- `OnboardingScreen.tsx` initial step: if `onboardingComplete && !pcSetupComplete` → step=7 directly.
- Pricing's `usePricingPurchase` keeps calling `app.completeOnboarding()` — that's correct (onboarding IS complete after paywall). The pricing-skip `finishOnboarding` also calls `completeOnboarding()` and sets `step=7`.
- `WelcomeConnectScreen` calls new action `app.completePcSetup()` on either successful pair or skip-confirm.
- `signOut` resets both flags.

This means: NO backend changes. IAP receipt can flip `onboardingComplete` all it wants — we're gated on the local-only flag.

## File layout (each ≤ 200 lines, one component per file)

```
src/screens/welcome/
  WelcomeConnectScreen.tsx          # ~90 lines, pure layout
  types.ts
  data/welcomeCopy.ts
  hooks/
    useWelcomeFlow.ts               # step state + skip + complete handler
    useFloatLoop.ts                 # extracted from SetupScreen ambientGlow
    useEntrance.ts                  # extracted from FrequencyQuestionScreen
    useRadarPulse.ts                # 3 rings off ONE shared driver
    useReduceMotion.ts              # AccessibilityInfo
  components/
    ConstellationBackdrop.tsx       # nebula image + 8 particles (hero only)
    StepIndicator.tsx               # 4-dot rail, accessibilityRole=progressbar
    PrimaryButton.tsx               # wraps existing connectPrimaryAction styles + shimmer
    SkipPill.tsx
    SkipConfirmSheet.tsx            # only used by StepApprove
    RadarPulse.tsx                  # uses useRadarPulse
    HandshakeGlyph.tsx              # phone + monitor + shield
    SuccessBurst.tsx                # sparkle particles + spring check
  steps/
    StepHero.tsx
    StepSetup.tsx                   # download+find combined
    StepApprove.tsx
    StepConnected.tsx
  styles/
    welcome1.ts, welcome2.ts, ...   # split if any file >200 lines
```

## Reuse decisions
- **Backdrop**: reuse `front-page-nebula.png` (`connectBackdrop` alias) — no new asset.
- **Gradient palette**: keep `#762CFF/#9D35FF/#B13CFF` literals (carry-over from SetupScreen). Don't refactor theme tokens right now — SetupScreen is being deleted in this same PR, so there's only one consumer of the literal post-delete.
- **CTA**: new `PrimaryButton` reuses `connectPrimaryAction` + `connectPrimaryActionGradient` styles; adds shimmer + press spring.
- **Pairing**: REUSE `app.discoverPairableDesktops`, `app.pairMachineAt`, `app.pairMachine`, `app.confirmPhonePermission` directly from `useAppContext()`. No new pairing logic.
- **Logo**: `VibyraLogo` as-is, floated via extracted `useFloatLoop`.
- **Step transition**: REUSE existing `AnimatedStep` component (not invent a new one).

## Performance/a11y commitments
- Particles only on hero (8 of them); inner steps use static nebula.
- Radar: 3 rings staggered off ONE shared driver.
- `accessibilityRole="progressbar"` + `accessibilityValue` on indicator.
- `AccessibilityInfo.isReduceMotionEnabled()` short-circuits all loops (replaces with static).
- `AccessibilityInfo.announceForAccessibility()` on step change, approval arrival, and success.
- All animations use native driver via `supportsNativeAnimation`.
- All loops cleaned up on unmount.
- No `ScrollView` — every step uses flex.
- AppState pause: DEFERRED to a follow-up (unmount cleanup is enough for v1).

## Hardware back behaviour
- Hero: back exits OnboardingScreen / Android home.
- Setup: back → Hero.
- Approve: back → opens "Cancel pairing?" confirm; on confirm → Setup.
- Connected: back disabled (`BackHandler` returns true).

## Deletions in same PR (audit-confirmed safe)
- `src/screens/onboarding/steps/SetupScreen.tsx`
- `src/screens/onboarding/steps/ConnectStepTwo.tsx`
- `src/screens/onboarding/steps/ConnectGuideModal.tsx`
- `src/screens/onboarding/components/ConnectStep.tsx`
- `src/screens/onboarding/components/WaitingApprovalIndicator.tsx`
- `src/screens/onboarding/components/PairAction.tsx`
- `src/screens/onboarding/components/PairCode.tsx`

Plus `data/connectGuide.ts` — only `ConnectGuideModal` reads it. Delete too.

## Definition of done
- New `WelcomeConnectScreen` at step 7 with 4 sub-steps.
- `pcSetupComplete` gate works (IAP can't bypass).
- Skip option visible from step 1 onward; confirmation on Approve only.
- Quiz, persona, pricing screens untouched.
- All new files ≤ 200 lines; one component per file.
- Reduce Motion respected.
- vibyra-frontend-audit and vibyra-clean-code pass.
- Old SetupScreen + 6 satellites deleted.
- Vault updated.
