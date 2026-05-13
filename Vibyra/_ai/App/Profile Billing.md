# App - Profile Billing

Read this for mobile billing UI, profile sheets, IAP/Stripe entry points, and model gating copy.

## Main Files

- `src/screens/onboarding/steps/usePricingPurchase.ts`
- `src/screens/onboarding/data/plans.ts`
- `src/screens/workspace/inline/profile/`
- `src/screens/workspace/data/chatModels.ts`
- `src/screens/workspace/data/assets.ts`
- `src/utils/billingApi.ts`
- `src/context/agentErrors.ts`

## Payment Paths

Mobile IAP uses `expo-iap` SKUs `app.vibyra.membership.{plan}.{cycle}`. On purchase success, `usePricingPurchase` posts the receipt to the backend with `reportIapReceipt`, applies returned user state via `app.applyRemoteUserFromIap`, then runs `finishTransaction`. If receipt POST fails, abort so paid-but-unrecorded purchases are not lost.

Web/Desktop Stripe uses backend checkout helpers outside the mobile Profile surface. Mobile Profile `BillingSheet.tsx` is a shipped-safe plan overview: plan cards are disabled, no Stripe checkout or external billing URLs are opened, and payment management is shown as unavailable until an IAP-backed mobile billing flow is wired.

## Profile Tab

Profile components live in `src/screens/workspace/inline/profile/`; `chunk18.tsx` is a re-export. `ProfilePage.tsx` reads account/app data from `useAppContext()`. Sheet state is owned by `useProfileSheets()`.

Every settings row and the plan badge are wired to bottom-sheet modals. The avatar image button opens the media library directly. The dedicated profile `BillingSheet` is distinct from the global `TokenMembershipSheet`; the token sheet is reachable via the header tokens button and chat low-credit nudge, not Profile.

`AppContext` exposes `signOut()` and `updateProfile({ name, email, machineName, profileImageUri })` for Profile. Toggle/appearance/language state is local-only unless wired to persistence.

Profile avatar uploads are handled in `ProfileHero.tsx` with `expo-image-picker` from the pencil/image button next to the avatar. The selected local URI is stored as `profileImageUri` in app-state persistence through `useAppState` / `appStatePersistence`; it is not posted to `/api/account/profile`, which remains name/email only.

## Plans And Model Gating

Plan ladder in `profile/types.ts::PLAN_TIERS` mirrors `backend/config/billing.php`. Onboarding pricing has separate data in `src/screens/onboarding/data/plans.ts`; keep both in sync.

`chatModels.ts` owns frontend model tiers and allowed tiers. Prefer `RemoteUser.allowedModelTiers` from backend user payload over ad-hoc checks. Backend also enforces tier on `/api/chat`.

`agentErrors.ts` maps credit, daily cap, and model-plan errors to Account/Billing nudges.

The Profile hero owns the level summary and level-map modal in `src/screens/workspace/inline/profile/ProfileHero.tsx`. The modal header applies safe-area top padding for mobile, and the map initially renders a six-level window around the current level; users must tap Show full map before the full roadmap is rendered.

Global mobile level-up notifications live in `src/components/LevelUpNotification.tsx` and are mounted by `AppProvider`. The host watches authenticated `levelProgress.level` increases after persistence is ready, so `/api/chat`, IAP/session user refreshes, and `/api/level/activity` updates share one top-of-screen celebration without firing on initial account restore.

Profile readiness release stance: mobile Profile billing is a plan overview only and does not open Stripe/external checkout; Refer & earn is hidden until referral API data exists; notification, biometric lock, and analytics controls are informational/unavailable rather than local-only toggles; avatar photo picking requires the explicit photo-library usage strings in `app.json`.
