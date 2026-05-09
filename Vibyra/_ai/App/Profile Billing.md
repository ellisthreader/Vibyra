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

Web/Desktop Stripe uses `BillingSheet.tsx` to call `startStripeCheckout(authToken, { kind: "subscription", plan, cycle })`, defaulting to annual. Manage payment calls `openBillingPortal(authToken)` and falls back to `https://vibyra.app/billing/manage`.

## Profile Tab

Profile components live in `src/screens/workspace/inline/profile/`; `chunk18.tsx` is a re-export. `ProfilePage.tsx` reads account/app data from `useAppContext()`. Sheet state is owned by `useProfileSheets()`.

Every settings row, the avatar pencil button, and the plan badge are wired to bottom-sheet modals. The dedicated profile `BillingSheet` is distinct from the global `TokenMembershipSheet`; the token sheet is reachable via the header tokens button and chat low-credit nudge, not Profile.

`AppContext` exposes `signOut()` and `updateProfile({ name, email, machineName })` for Profile. Toggle/appearance/language state is local-only unless wired to persistence.

## Plans And Model Gating

Plan ladder in `profile/types.ts::PLAN_TIERS` mirrors `backend/config/billing.php`. Onboarding pricing has separate data in `src/screens/onboarding/data/plans.ts`; keep both in sync.

`chatModels.ts` owns frontend model tiers and allowed tiers. Prefer `RemoteUser.allowedModelTiers` from backend user payload over ad-hoc checks. Backend also enforces tier on `/api/chat`.

`agentErrors.ts` maps credit, daily cap, and model-plan errors to Account/Billing nudges.
