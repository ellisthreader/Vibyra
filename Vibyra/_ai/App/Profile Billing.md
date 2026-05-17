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

Web/Desktop Stripe uses backend checkout helpers outside the mobile Profile surface. Mobile Profile `BillingSheet.tsx` is a shipped-safe plan overview: plan cards remain non-purchasing (`onSelect` is a no-op for non-current tiers, no Stripe checkout or external billing URLs are opened) until an IAP-backed mobile billing flow is wired. The earlier "Mobile upgrades and payment management are not available in this build" disclaimer was removed; cards no longer render dimmed and the footer is a single subtle "Cancel anytime · Plan access syncs to your account" line.

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

Level-map vibecoding rank names live in `src/screens/workspace/inline/profile/levelTitles.ts` and render in `ProfileLevelProgressModal.tsx`. The hero shows the current rank; map rows only show a rank label on exact unlock levels, not on every level. Keep names maker/build/prompt themed, such as Prompt Tuner, Professional Prompter, Senior Vibecoder, and Master Vibecoder.

Global mobile level-up notifications live in `src/components/LevelUpNotification.tsx` and are mounted by `AppProvider`. The host watches authenticated `levelProgress.level` increases after persistence is ready, renders below the mobile safe-area top inset, and reads the current level-map node to say when credit rewards were earned. `/api/chat`, IAP/session user refreshes, and `/api/level/activity` updates share one top-of-screen celebration without firing on initial account restore.

Level-up notification colors are explicit per scheme in `src/components/LevelUpNotificationTheme.ts`; keep the component wired to `PreferencesContext.effectiveScheme` because it does not use the workspace style transformer.

`ProfilePage.tsx` uses full-width horizontal setting rows grouped under Account, Preferences, and Support, with larger gaps between category groups. Profile scrolling is enabled in `WorkspaceScreen.tsx`; do not force every Profile action above the fold. The shared `TopBar` is hidden on Profile so the profile hero starts at the top of the workspace content instead of sitting below a separate "Profile" header. `ProfileHero.tsx` does not show the email line; the level bar sits under the user name, and the plan badge stays at the hero row's top-right. `Clear cache` and `Log out` stay in a separate action row rendered immediately below Support, not as a pinned footer. `ClearCacheSheet.tsx` confirms before calling `AppContext.clearCache()`, which clears cached chats/projects/files/desktop sessions/logs/edit approvals while keeping the signed-in account, plan, credits, and profile. Do not re-add non-production level-up test buttons to the profile surface.

Profile readiness release stance: mobile Profile billing is a plan overview only and does not open Stripe/external checkout; Refer & earn opens an unavailable-state sheet until referral API data exists; notification, biometric lock, and analytics controls are informational/unavailable rather than local-only toggles; avatar photo picking requires the explicit photo-library usage strings in `app.json`.

## BillingSheet Layout

`BillingSheet.tsx` wraps the page body in a `ScrollView` (not a flex container) so the four `BillingFeaturedPlan` cards have intrinsic height instead of competing for vertical space. `BillingPlanPager` no longer uses `flex: 1`; it just renders a vertical stack with `gap: 12`.

Page order is: header (back + title + tokens chip) → billing cycle toggle → four plan cards → footer block. There is no longer a "Current plan" hero card at the top — `CurrentPlanCard.tsx` was deleted because the current plan is already indicated by the green "Current" chip on the matching `BillingFeaturedPlan`, so the hero was redundant and stole vertical space on phones.

Each `BillingFeaturedPlan` card head is `icon | name+tokens column | price block` and the name row uses `flexWrap: "wrap"` so the "Most Popular" / "Recommended" ribbon drops below the plan name on narrow phones instead of overlapping the price column. A 1px divider sits between the head and the perks list. Perks allow up to 2 lines so credit/budget descriptions are not truncated on small widths. The current-plan chip is a green pill aligned to the right under the price column.

When tweaking plan card visuals: do not reintroduce `flex: 1` / `minHeight` on `featuredPlanWrap` or `featuredPlanCard` — that was the original source of the squashed-perk overlap on phone, and the layout now relies on intrinsic card heights inside the page-level `ScrollView`.

## Manage Subscription Link

`BillingSheet.tsx` renders a centred "Manage your subscription" hyperlink under the "Cancel anytime · Plan access syncs to your account" line. It opens the platform-correct subscription management URL via `Linking.openURL`:
- iOS: `https://apps.apple.com/account/subscriptions`
- Android: `https://play.google.com/store/account/subscriptions`

This is the compliance hook required by App Store Review Guideline 3.1.2 (auto-renewing subscriptions must expose a functional link to subscription management) and the Google Play Payments policy (cancel path must be reachable). Apple/Google handle the actual cancel flow — the app only needs to provide the link. Do not replace this with an in-app cancel UI: it would not be authoritative against the platform receipt and could fail review.
