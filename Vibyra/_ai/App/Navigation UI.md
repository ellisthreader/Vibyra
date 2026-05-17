# App - Navigation UI

Read this for high-level app UI entry points, bottom nav routing, and broad visual tasks that are not feature-specific.

## Main Files

- `App.tsx`
- `src/screens/WorkspaceScreen.tsx`
- `src/screens/OnboardingScreen.tsx`
- `src/screens/workspace/data/pages.ts`
- `src/screens/workspace/inline/index.ts`
- `src/screens/workspace/inline/chunk1.tsx`
- `src/styles/theme.ts`
- `src/components/`

## Chat-First Shell

The workspace defaults to `chat` in `src/screens/workspace/hooks/useWorkspaceState.ts`. Primary chrome is intentionally ChatGPT-like: `TopBar` opens a left workspace menu from the menu icon and an account menu from the avatar button. `BottomNav` remains exported for legacy use, but the active workspace shell no longer renders it.

`PrimaryMenuSheet` and `AccountMenuSheet` live in `src/screens/workspace/inline/WorkspaceMenus.tsx`. Projects, Explore/Community, and Account are reached from the left workspace menu; Profile, Billing, Appearance, Security, Credits, and Log out are reached from the account menu. Profile and Community should not be added back to primary navigation unless the product direction changes. The top-right chrome button is contextual: on chat it is a play/preview action calling `openRunnablePreview`; on non-chat pages it opens the account menu.

The legacy `pages` array in `src/screens/workspace/data/pages.ts` is limited to chat, projects, and active builds; profile/community are secondary destinations.

Community is user-facing as "Explore" in top-level chrome while retaining `community` route/state keys internally.

Once a chat has messages, the chat-only top-right overflow menu shows Star, Rename, Help, and Delete actions; keep this menu small and iOS-popover-like.

## Chat Entry

Opening AI Chat from the bottom nav or dashboard is a detached new chat and must not show the last selected project thread. Project chat context should appear only after explicitly opening/selecting a folder/project.

## Page Headers

Decision (2026-05-09, updated 2026-05-11): top-level pages render header *actions* only — no decorative hero images and no short subtitle/description copy. Pages should start with the action buttons/tabs at the top, then content. Removed: `dashboardHeroArt` (Dashboard welcome), `projectsBackdrop` + `projectsFoldersHero` (Projects), `communityHero` + subtitle (Community), `aiChatGlyph` + subtitle (Chat empty state). Dashboard has no welcome/status header, no title block, and no top action buttons; when builds exist, it prioritizes two count tiles (Building and Queued), then compact In progress and Queued build rows that fit on one page. Projects keeps its Create Project gradient button as the only header element. If you add a new top-level tab, follow this pattern — buttons/title first, no hero art.

## Visual Work

Use `src/styles/theme.ts` first for shared colors, spacing, typography, and component style direction. Read screen/style chunks only for the area being changed.

Auth/login first page: `src/screens/AuthScreen.tsx` owns the front-page login layout; `src/screens/auth/styles.ts` owns the shared auth surface styles. The "Continue with email" expansion uses a compact scrollable state with automatic scroll-to-bottom so the full email panel remains visible on short iPhone screens.

Welcome PC setup starts at `src/screens/welcome/WelcomeConnectScreen.tsx`; Step 2 is `steps/StepSetup.tsx`, with the simple logo-to-PC morph in `hooks/useLogoMorph.ts` and setup-specific styles in `styles/welcome6.ts`. The welcome flow uses `src/assets/welcome-connect-background.png` through `components/ConstellationBackdrop.tsx`, but Step 2 specifically uses the GPT-generated `src/assets/welcome-setup-background.png`; keep both centers dark for text readability. Keep the one-minute "keep Vibyra Desktop open" scan help on Step 2 while the retry loop continues.

Onboarding quiz slides share the generated `src/assets/onboarding-quiz-background.png` backdrop through `src/screens/onboarding/components/Backdrop.tsx`; answer icons render directly on the cards without inner icon boxes, with restrained purple selected states in `src/screens/onboarding/styles/part6.ts` and `src/screens/onboarding/steps/FrequencyQuestionScreen.tsx`. The "Start anywhere. Continue Everywhere." moment screen uses its own generated `src/assets/onboarding-moment-background.png` via `momentBackdrop` in `src/screens/onboarding/data/options.ts`; `OnboardingScreen.tsx` renders it behind the full moment flow so progress, content, and bottom nav share one continuous background, while `OnboardingNav.tsx` reuses the quiz/art button treatment for moment Back/Continue. Keep the moment hero image free of extra glow-circle backing layers, and keep the result/builder-profile hero icon free of glow/ring backing layers.

The onboarding paywall uses the generated `src/assets/onboarding-pricing-background.png` image in `src/screens/onboarding/steps/PricingScreen.tsx`; keep the Starter/Builder/Pro selector as large full-width cards/pills for phone readability.

Top-level non-chat tabs use a shared 18px content gutter from `WorkspaceScreen`/`styles/part16.ts`; tab-specific content should avoid adding extra horizontal padding unless a nested component needs it. The Dashboard home page intentionally avoids a top welcome/status panel and should remain queue-first and minimal. Relevant files: `src/screens/WorkspaceScreen.tsx`, `src/screens/workspace/inline/chunk6.tsx`, `src/screens/workspace/inline/chunk7.tsx`, `src/screens/workspace/inline/HomeBuildCard.tsx`, `src/screens/workspace/styles/part16.ts`, `src/screens/workspace/styles/part31.ts`, `src/screens/workspace/styles/part32.ts`.

Home readiness fixes: `HomeBuildCard.tsx` must use real agent progress/model/file metadata, not hard-coded timing or queue position. `chunk6.tsx` and `chunk7.tsx` render all running/queued builds inside a bounded scroll area while the count tiles show full totals. When there are no active builds, `chunk7.tsx` hides the queue tiles and uses a centered empty state with `projectsFoldersHero`, the "Nothing is being built yet" headline, and the Create your first build CTA.

Light mode (2026-05-13): keep dark mode as the source visual identity, but light mode must use explicit semantic tokens instead of generic inversion. `src/styles/theme.ts` exports `darkColors`, `lightColors`, and the legacy `colors = darkColors`; `PreferencesContext` exposes `prefs.colors` and `useThemedColor`. Workspace shared styles still build a dark and light sheet through `src/screens/workspace/styles/themeTransform.ts`, but the transformer maps common dark surfaces/text/borders/scrims to the explicit light palette. JSX props and local StyleSheets do not pass through the shared style proxy, so use `useThemedColor` or `prefs.colors` for inline icon, placeholder, gradient, modal, code block, billing, and sheet colors. Code block syntax has separate palettes in `src/utils/syntaxHighlight.ts`.

## Desktop Recreation

`Vibyra/_ai/Mobile App Desktop Recreation Spec.md` captures the current mobile app identity, assets, screens, copy, color system, and recommended desktop layout adaptation for recreating the app on desktop.
