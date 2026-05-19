---
name: VibyraDesktopFrontendDesign
description: Apply Vibyra desktop app frontend design rules. Use when changing, reviewing, or proposing UI for the Vibyra desktop shell, especially the welcome/auth screen, top bar, sidebar, dashboard, chat surface, responsive layout, Vibyra logo, profile/avatar, phone connection indicators, recent chats, or desktop visual polish.
metadata:
  short-description: Vibyra desktop frontend design rules
---

# VibyraDesktopFrontendDesign

Use this skill for `/desktop` frontend work. It captures the Vibyra desktop visual direction learned from product feedback.

## First Steps

1. Follow repo memory protocol first.
2. Read `Vibyra/_ai/Vibyra Desktop Memory.md`.
3. Read `Vibyra/_ai/Desktop/Desktop Shell.md`.
4. Inspect the smallest relevant source set, usually:
   - `desktop/app.html`
   - `desktop/assets/app.1.js`
   - `desktop/assets/app.2.js`
   - `desktop/assets/app.7.css`
   - `desktop/assets/app.auth.css`
   - `desktop/assets/app.auth.js`

## Design Direction

Vibyra desktop should feel like a simple, dark, mobile-inspired AI desktop app, not a heavy admin dashboard.

- Use the mobile app as the visual source of truth.
- Prefer fewer boxes, fewer labels, fewer pills, and fewer explanatory captions.
- Keep controls familiar and quiet: icon buttons, simple avatars, concise nav rows.
- Use the restrained mobile palette: `#07070A`, `#12121A`, `#160D2A`, `#6D3BFF`, `#8B5CFF`.
- Keep card radius modest, usually `8px` or less unless the existing shell pattern says otherwise.
- Avoid glow-heavy, marketing-heavy, or decorative dashboard styling.

## Auth Welcome Screen

- Match the mobile first welcome page.
- Use `/app-assets/front-auth.jpg` and `/app-assets/vibyra.png`.
- The desktop auth session is visual-only local shell state stored in `localStorage["vibyra.desktop.auth"]`; do not imply real billing/account balance unless a desktop account API exists.
- Keep the same first-page feature labels as mobile: Beautiful, Fast, Code.
- Hide the feature strip while the email form is expanded.
- Keep the Vibyra logo visible and unclipped: use `object-fit: contain`, avoid negative offsets, and avoid hidden overflow around the logo.
- Provider buttons must stay on one line: `Continue with Google`, `Continue with Apple`, `Continue with email`.
- Use real provider marks/SVGs, not placeholder letters.
- Do not add quizzes, onboarding flows, or connect pages. After login, go straight to Builds/dashboard.
- The account modal owns session controls; `Log out` should clear the local desktop session and return to the auth screen.

## Top Bar

Keep it extremely simple.

- Phone status: show only a phone icon, plus a small green dot when connected.
- Do not show a bordered connection pill with repeated text.
- Profile: show only a Google-style avatar/image or first initial.
- Do not show `Desktop session`, plan text, email text, or a boxed account chip in the top bar.
- Controls should be unboxed by default; use hover feedback only.

## Sidebar

The sidebar should feel like the mobile app’s AI/chat navigation.

- Keep the Vibyra logo at the top.
- Do not show a profile card/block at the top of the sidebar.
- Primary nav should stay simple: Chat, Projects, Builds.
- Include recent chats in the sidebar when desktop chat history exists.
- Bottom phone/PC status should be an unboxed status row, not a card with a heavy border/background.
- Keep the rail expanded with recent chats until roughly tablet width; collapse to icons/tooltips around `900px`.

## Chat And Dashboard

- Chat should be calm and AI-app-like: compact prompt chips, restrained bottom composer, clean message rows.
- Chat draft and recent chat history are local shell state: `vibyra.desktop.chatDraft`, `vibyra.desktop.recentChats`, and `vibyra.desktop.activeChat`.
- The chat model menu should mirror the mobile model groups/logos from `src/screens/workspace/data/chatModels.ts`, and effort values should stay `low`, `medium`, `high`, `xhigh`.
- The desktop paperclip menu should be a simple vertical list, not a top action grid. Use the same row shape for every option: icon, short label, short description. Include Photos, Files, Create image, Deep research, Agent web search, and Analyze files. Do not include Camera on desktop. Keep local AI skills such as Plan/Debug/Review in `/` slash suggestions, not in the paperclip menu.
- Do not make desktop chat start `/agents/start` directly unless there is an intentional desktop-authenticated agent contract; that route is phone-authenticated.
- After desktop auth, default to Builds/dashboard via `vibyra.desktop.page = "dashboard"` unless a stored page intentionally overrides it.
- Builds/dashboard must use real `/desktop/state` data only.
- Do not invent fake counts, fake activity, fake progress bars, fake credits, or fake community/profile data.
- Show active desktop agent runs from real state as compact rows, not predicted progress, token counts, percentages, or fallback build rows.
- Keep account/billing details in the account modal unless a real desktop account API requires more.

## Projects

- Projects should keep the full-width shell style: toolbar below the top bar and a compact card grid.
- On wide screens, use a three-card grid with roughly 176px cards, 16px padding, about 14px column gaps, and 16px row gaps.
- Active project cards should use a purple border; avoid invented project counts or activity metadata.

## Common Mistakes To Avoid

- Adding boxes around every control.
- Showing profile/session metadata where an avatar is enough.
- Making desktop look more like an admin dashboard than the mobile app.
- Collapsing useful sidebar content too early on medium screens.
- Cropping the Vibyra logo with hidden overflow or negative image positioning.
- Adding explanatory text inside the app for obvious controls.

## Responsive Checks

Before finishing visual work:

- Run syntax checks for changed desktop JS: `node --check desktop/assets/app.1.js`, etc.
- Use browser screenshots at desktop, medium, and small widths, for example `1360x820`, `940x760`, and `700x760`.
- Check that text does not wrap awkwardly, the logo is not clipped, topbar controls are unboxed, and sidebar content collapses only when useful.
- If using headless Chrome, include `--run-all-compositor-stages-before-draw --virtual-time-budget=2000` for reliable small-width screenshots.
