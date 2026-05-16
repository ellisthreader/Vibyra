# Welcome+Connect Flow — Implementation Plan

## Goal
After login (and the existing quiz/paywall) the user lands on a new, **slick, animation-heavy welcome+connect** experience. Two outcomes are allowed: (1) connect a PC → workspace, or (2) skip → workspace. The user cannot reach `WorkspaceScreen` by any other path.

The existing quiz stays as-is. Only the **post-quiz → workspace handoff** is rebuilt.

## High-level UX
1. **Welcome hero** — "Welcome, {firstName}" with logo float, particle constellation backdrop, gradient title; primary CTA "Let's get started", quiet "Skip for now" pill.
2. **Step 1 — Download** — Animated desktop icon + descending download arrow, "Get Vibyra Desktop at vibyra.ai". Primary "I've downloaded it" advances.
3. **Step 2 — Find your PC** — Auto-discovery with a beautiful radar pulse animation. If discovery returns nothing, gracefully reveal a "Use a code" tab with a 6-char input. Tap a found PC → request approval.
4. **Step 3 — Approve** — Phone+PC handshake animation, "Tap Allow on your computer". When `pendingPhoneApproval` arrives, big "Confirm on phone" CTA.
5. **Step 4 — Connected** — Burst of sparkles + spring-scaled checkmark. After 1.6s, calls `app.completeOnboarding()` and lets `App.tsx` route to workspace.

A top-right `Skip` is always visible from step 1 onward. Skip immediately calls `completeOnboarding()` (no paired desktop) and returns to workspace.

## Animation system
- **Backdrop**: shared `ConstellationBackdrop` underneath all sub-steps. Slow drifting `Animated` particles + nebula gradient + parallax that nudges to the right of the active step (so the bg "moves" as the user advances).
- **Step transitions**: 280ms `Easing.out(cubic)` fade + 18px translateY. Reuses the existing `AnimatedStep` keyed transition pattern.
- **Logo float**: 0 → -7px translateY, 2600ms easeInOutCubic, loop (mirrors current `SetupScreen` glow loop).
- **Step indicator**: a single morphing rail of 4 dots that fill + grow when active; rail line animates its width on advance.
- **Radar (step 2)**: 3 concentric rings expanding via `Animated.loop` (scale 1→1.8, opacity 0.5→0). Plus a rotating sweep line.
- **Handshake (step 3)**: phone + monitor svg-ish glyphs that pulse toward each other; shield icon scales in when `pendingPhoneApproval` lands.
- **Success (step 4)**: 12 sparkle particles burst outward (Animated.timing on translateX/Y + opacity to 0). Checkmark `Animated.spring` from 0.4→1 scale.
- **Primary CTA**: gradient (existing `#762CFF→#9D35FF→#B13CFF`), shimmer line that sweeps across every 3.4s, press-in spring (scale 0.97).

All loops use `supportsNativeAnimation` (already imported across the codebase) for the native driver.

## State changes
1. **`OnboardingScreen.finishOnboarding`** must STOP calling `app.completeOnboarding()`. It only advances `step → 7`.
2. **`usePricingPurchase.ts:49`** must STOP calling `app.completeOnboarding()`. It just calls `onClose()` (which now advances to the welcome+connect stage).
3. **New `WelcomeConnectScreen`** at step 7 owns the call to `app.completeOnboarding()` on success or skip.

This means the only path that flips `onboardingComplete=true` is "connect succeeded" or "user pressed Skip". `paired` state already exists (`useAppState.ts:29`) and is set by pairing flows.

## File structure (each file ≤ 200 lines, one component per file)

```
src/screens/welcome/
  WelcomeConnectScreen.tsx          (orchestrator, <140 lines)
  types.ts                          (WelcomeStep enum, props types)
  data/
    welcomeCopy.ts                  (titles, helper lines per step)
  hooks/
    useStepTransition.ts            (manages animated transition values)
    useRadarPulse.ts                (3-ring expansion loop)
    useFloatLoop.ts                 (logo float)
    useShimmer.ts                   (gradient CTA shimmer)
    useSparkleBurst.ts              (success burst)
  components/
    ConstellationBackdrop.tsx       (drifting particles + nebula gradient, parallax by step)
    StepIndicator.tsx               (4-dot animated rail)
    PrimaryButton.tsx               (gradient CTA with shimmer + press spring)
    SkipPill.tsx                    (top-right subtle button)
    AnimatedCard.tsx                (panel wrapper with entrance animation)
    RadarPulse.tsx                  (uses useRadarPulse)
    HandshakeGlyph.tsx              (animated phone+pc + shield)
    SuccessBurst.tsx                (uses useSparkleBurst + checkmark spring)
  steps/
    StepHero.tsx                    (welcome step 0)
    StepDownload.tsx                (step 1)
    StepFind.tsx                    (step 2 — discovery + manual code)
    StepApprove.tsx                 (step 3)
    StepConnected.tsx               (step 4)
  styles/
    welcome.ts                      (split into parts if any file >200 lines)
```

## Wiring
- `src/screens/OnboardingScreen.tsx` line 183 `<SetupScreen />` → `<WelcomeConnectScreen />` import from `./welcome/WelcomeConnectScreen`.
- `src/screens/OnboardingScreen.tsx` `finishOnboarding` becomes simply `() => setStep(7)`.
- `src/screens/onboarding/steps/usePricingPurchase.ts` remove `app.completeOnboarding()` line 49; replace status copy with "Membership active — connect your PC."
- Keep the old `SetupScreen.tsx` file untouched for now (it's already dead) — DELETE it instead, plus its sole-import `ConnectStep.tsx`, `ConnectStepTwo.tsx`, `ConnectGuideModal.tsx`, `WaitingApprovalIndicator.tsx`, `PairAction.tsx`, `PairCode.tsx` IF and only if nothing else imports them. Audit imports before deleting.

## Skip behaviour
- `SkipPill` on every sub-step from `download` onward (not on hero — hero already has "Let's get started" as the only intentional CTA, plus a discrete "Skip for now" pill on hero so the user knows the option exists).
- Skip handler: confirm via in-app sheet "Skip PC setup? You can connect later from Settings." → on confirm, call `app.completeOnboarding()`.

## Internationalisation
Use existing `useTranslation()` hook if present; otherwise hard-code English copy in `welcomeCopy.ts` so a future i18n pass has a single file to translate. **Avoid** `toLocaleString` / `Intl` formatters per Hermes Intl risk noted in vibyra-frontend-audit skill.

## Theming
- This flow is always dark (consistent with the existing onboarding nebula). Do NOT key off `useScheme()`.
- All icon colours go through `colors` from `src/styles/theme.ts`. No inline hex for Ionicons except gradient stops, which match existing magenta/violet palette already used by `SetupScreen`.

## Accessibility & perf
- All animated icons: `accessible={false}` (decorative).
- All Pressables: `accessibilityRole="button"` and `accessibilityLabel`.
- Particle count capped at 18 to stay fluid on low-end Androids.
- Radar/burst loops STOPPED on unmount via cleanup returns (prevents leaked frames when navigating away).
- Use `useNativeDriver` everywhere except where animating layout/colour.

## Risks
- **Discovery on a phone-only emulator returns nothing** → must show manual code fallback proactively after 6s.
- **`pendingPhoneApproval` may already be set** if the user re-enters this flow with a half-completed pair. `StepApprove` mounts already-approving if state is set; on mount of StepFind we read `app.paired` and skip directly to StepConnected.
- **Pricing purchase on iOS** sets `onboardingComplete=true` via the IAP receipt response from backend (`reportIapReceipt`) — confirm `applyRemoteUser` does NOT flip `onboardingComplete` based on server. **Check before shipping.** If it does, we need a `pcSetupComplete` flag added to persistence.

## Definition of done
- `OnboardingScreen` step 7 renders the new `WelcomeConnectScreen`.
- User cannot reach `WorkspaceScreen` without either successful pair or skip.
- Quiz, persona, pricing untouched.
- All new files ≤ 200 lines; one component per file.
- vibyra-frontend-audit and vibyra-clean-code pass.
- Vault updated.
