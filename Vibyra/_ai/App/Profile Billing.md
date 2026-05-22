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

Profile `BillingSheet.tsx` uses `useProfileBillingPurchase.ts` for native iOS/Android subscriptions through `expo-iap`; on success it posts the receipt with `reportIapReceipt` and applies the returned user state. On web only, paid tiers call the backend Stripe helper `startStripeCheckout(authToken, { kind: "subscription", plan, cycle })` and open the returned URL with `Linking.openURL`. Current/free management calls `openBillingPortal(authToken)` when signed in, with platform subscription URLs as fallback. Onboarding still uses the separate `usePricingPurchase` flow because it also completes onboarding after purchase.

## Profile Tab

Profile components live in `src/screens/workspace/inline/profile/`; `chunk18.tsx` is a re-export. `ProfilePage.tsx` reads account/app data from `useAppContext()`. Sheet state is owned by `useProfileSheets()`. Delete account is a bottom action below Log out and opens `DeleteAccountSheet.tsx`, which requires typing `DELETE` plus the account password before calling `DELETE /api/account` and signing out locally.

Every settings row and the plan badge are wired to bottom-sheet modals. The avatar image button opens the media library directly. The dedicated profile `BillingSheet` is distinct from the global `TokenMembershipSheet`; the token sheet is reachable via the header tokens button and chat low-credit nudge, not Profile.

Account-menu shortcuts such as Billing, Appearance, Security, and Credits route through `WorkspaceScreen.tsx` by setting `settingsTab`, bumping `settingsTabRequestId`, and switching `activePage` to Profile. `ProfilePage.tsx` must seed `useProfileSheets()` with the requested sheet on initial render and request-id changes, instead of opening the sheet from a post-render effect; this keeps direct menu taps from flashing the profile page before the target modal slides in.

`UsageSheet.tsx` should stay a simple usage utility, not a mini billing dashboard: header back + title only, one remaining-token hero with the manage/upgrade link inline, two compact counters, and one segmented History list for Projects or Chats. Keep rows plain with small icons and text; avoid reintroducing boxed source chips, a plan stat tile, duplicate header token pills, or separate recent-project/recent-chat card stacks.

Mobile quota visibility lives in `UsageLimitsSection.tsx`, rendered between the Usage sheet token hero and history rows. It reads `burstCredits*` and `weeklyCredits*` from `AppContext`, so auth/session refreshes and post-chat user payloads update the 5-hour and weekly rows with exact reset times. AI chat enforcement should match this visible contract: `/api/chat` and `/api/chat/stream` enforce 5-hour burst and weekly caps, not a visible daily chat cap. `RemoteUser`, persistence normalization, `useAppState`, `useAuthContextActions`, and `useAgentResultHandlers` must stay in sync with backend `userPayload()` quota fields.

`AppContext` exposes `signOut()` and `updateProfile({ name, email, machineName, profileImageUri })` for Profile. Toggle/appearance/language state is local-only unless wired to persistence.

Mobile auth requests in `src/context/useAuthContextActions.ts` include a platform device label (`Vibyra iPhone`, `Vibyra Android`, `Vibyra Web`, or fallback `Vibyra App`) plus the persisted `installId`. The backend stores this as `VibyraSession.device_name`, and desktop Account settings uses it when listing signed-in phones/devices.

Profile avatar uploads are handled in `ProfileHero.tsx` with `expo-image-picker` from the pencil/image button next to the avatar. The selected local URI is stored as `profileImageUri` in app-state persistence through `useAppState` / `appStatePersistence`; it is not posted to `/api/account/profile`, which remains name/email only. Keep the profile hero's level summary as a plain inline row under the user name: level, map icon button directly beside the level label, then current/next XP text; do not box it or add a hero progress bar.

Avatar display uses `src/screens/workspace/inline/AccountAvatar.tsx`: if `profileImageUri` exists, render the photo directly with no decorative border/background; otherwise render a Google-style colored circle using the first letter of the user's name. Keep the top account button, account menu, and Profile hero on this shared behavior.

## Plans And Model Gating

Plan ladder in `profile/types.ts::PLAN_TIERS` mirrors `backend/config/billing.php`. Onboarding pricing has separate data in `src/screens/onboarding/data/plans.ts`; keep both in sync.

`chatModels.ts` owns frontend model tiers and allowed tiers. Prefer `RemoteUser.allowedModelTiers` from backend user payload over ad-hoc checks. Backend also enforces tier on `/api/chat`.

`agentErrors.ts` maps credit, daily cap, and model-plan errors to Account/Billing nudges.

The Profile hero owns the level summary and level-map modal in `src/screens/workspace/inline/profile/ProfileHero.tsx`. The modal header applies safe-area top padding for mobile, and the map initially renders a six-level window around the current level; users must tap Show full map before the full roadmap is rendered. Keep the level-map page simple: compact current-level summary, thin progress bar, quiet roadmap rows, reward chips only on reward levels, and an inline expandable "How XP works" section instead of floating help or stat cards.

Level-map vibecoding rank names live in `src/screens/workspace/inline/profile/levelTitles.ts` and render in `ProfileLevelProgressModal.tsx`. The hero shows the current rank; map rows only show a rank label on exact unlock levels, not on every level. Keep names maker/build/prompt themed, such as Prompt Tuner, Professional Prompter, Senior Vibecoder, and Master Vibecoder.

Global mobile level-up notifications live in `src/components/LevelUpNotification.tsx` and are mounted by `AppProvider`. The host watches authenticated `levelProgress.level` increases after persistence is ready, renders below the mobile safe-area top inset, and reads the current level-map node to say when credit rewards were earned. `/api/chat`, IAP/session user refreshes, and `/api/level/activity` updates share one top-of-screen celebration without firing on initial account restore.

Level-up notification colors are explicit per scheme in `src/components/LevelUpNotificationTheme.ts`; keep the component wired to `PreferencesContext.effectiveScheme` because it does not use the workspace style transformer.

`ProfilePage.tsx` uses full-width horizontal setting rows grouped under Account, Preferences, and Support, with larger gaps between category groups. Profile scrolling is enabled in `WorkspaceScreen.tsx`; do not force every Profile action above the fold. The shared `TopBar` is hidden on Profile so the profile hero starts at the top of the workspace content instead of sitting below a separate "Profile" header. `ProfileHero.tsx` does not show the email line; the level bar sits under the user name, and the plan badge stays at the hero row's top-right. `Clear cache` and `Log out` stay in a separate action row rendered immediately below Support, not as a pinned footer. `ClearCacheSheet.tsx` confirms before calling `AppContext.clearCache()`, which clears cached chats/projects/files/desktop sessions/logs/edit approvals while keeping the signed-in account, plan, credits, and profile. Do not re-add non-production level-up test buttons to the profile surface.

Profile readiness release stance: `NotificationsSheet` exposes local persisted notification preferences through `PreferencesContext.notifications` and `setNotificationPreference`. `SecuritySheet` exposes local persisted Improve Vibyra and App lock toggles through `PreferencesContext.improveVibyra`/`setImproveVibyra` and `appLockEnabled`/`setAppLockEnabled`, plus Local data and Privacy policy rows. App lock uses `expo-local-authentication` and is enforced in `App.tsx` on launch and foreground resume; enabling it requires a successful Face ID/Touch ID/device-passcode check. Avatar photo picking requires the explicit photo-library usage strings in `app.json`.

Refer & earn is backed by `GET /api/referrals/me` through `src/utils/referralsApi.ts`. `ReferSheet.tsx` fetches the authenticated user's invite code/link, uses React Native `Share` for link/code sharing, and displays signed-up/paid/earned stats. Keep the modal simple: plain invite code, Share and Copy actions, and small stats only; avoid nested cards/boxes and reward disclaimers. Email signup exposes an optional invite-code field via `authReferralCode`; backend signup also accepts `referralCode`/`ref`.

## BillingSheet Layout

`BillingSheet.tsx` now owns the selected plan state. Page order is: header (back + title + tokens chip) → selected-plan artwork hero (`BillingPlanHero`) → billing cycle toggle → compact plan options (`BillingPlanOption`) → sticky footer CTA. The selected-plan hero uses the GPT-generated `src/assets/billing-plans/{free,starter,builder,pro}-card.png` assets at 1430x1100, and `part58.ts` enforces the same `1430 / 1100` hero `aspectRatio` so the card does not drift from the art. `BillingPlanHero` animates membership switches with an outgoing/incoming layered card transition (directional slide, depth scale, and slight 3D tilt); its layer styles live in `src/screens/workspace/styles/part60.ts` to keep `part58.ts` under the file-size guideline. `BillingPlanHero` keeps text in a separate absolute overlay (`billingPlanHeroContent`) above the transformed art layers, with only a light opacity/translate/scale entrance; do not put `Text` inside perspective/rotateY card layers because iOS can flicker or rasterize it during native-driver transforms. The hero title sits at the top, plan benefits render as plain bullet rows instead of stat boxes, and copy should use the selected membership accent. Keep the lower-left area of any future replacements dark and low-detail because the price and benefit bullets overlay there.

`billingUtils.ts` normalizes account plan strings and centralizes display price/tokens for monthly versus annual billing. `BillingFeaturedPlan` and `BillingPlanPager` remain in the folder as older card-style components, but the active billing sheet uses the hero-plus-options layout.

Keep billing source files under the repo's 200-line guideline. Put core billing layout styles in `src/screens/workspace/styles/part58.ts`; use focused follow-up chunks such as `part60.ts` when animation/support styles would push `part58.ts` over the limit.

## Manage Subscription Link

`BillingSheet.tsx` keeps platform subscription management URLs as a fallback path:
- iOS: `https://apps.apple.com/account/subscriptions`
- Android: `https://play.google.com/store/account/subscriptions`

This is the compliance hook required by App Store Review Guideline 3.1.2 (auto-renewing subscriptions must expose a functional link to subscription management) and the Google Play Payments policy (cancel path must be reachable). Apple/Google handle the actual cancel flow — the app only needs to provide a reachable path. Do not replace this with an in-app cancel UI: it would not be authoritative against the platform receipt and could fail review.
