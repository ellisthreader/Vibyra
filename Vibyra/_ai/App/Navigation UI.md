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

## Bottom Nav

The five tabs are configured in `src/screens/workspace/data/pages.ts`: `dashboard` (Home), `projects`, `chat` (AI Chat), `community`, and `profile`.

Each tab maps to a top-level page component exported from `src/screens/workspace/inline/index.ts`: DashboardHome, ProjectsPage, AIChatPage, CommunityPage, and ProfilePage.

`BottomNav` lives in `chunk1.tsx` and renders from the `pages` array.

## Chat Entry

Opening AI Chat from the bottom nav or dashboard is a detached new chat and must not show the last selected project thread. Project chat context should appear only after explicitly opening/selecting a folder/project.

## Page Headers

Decision (2026-05-09): top-level pages render header *actions* only — no decorative hero images and no short subtitle/description copy. Pages should start with the action buttons/tabs at the top, then content. Removed: `dashboardHeroArt` (Dashboard welcome), `projectsBackdrop` + `projectsFoldersHero` (Projects), `communityHero` + subtitle (Community), `aiChatGlyph` + subtitle (Chat empty state). The Dashboard welcome panel keeps the live pill + "Ready to build" title; Projects keeps its Create Project gradient button as the only header element. If you add a new top-level tab, follow this pattern — buttons/title first, no hero art.

## Visual Work

Use `src/styles/theme.ts` first for shared colors, spacing, typography, and component style direction. Read screen/style chunks only for the area being changed.
