# Vibyra marketing website: product review and implementation plan

Reviewed 4 September 2026 against the active `/home/ellis/Desktop/Vibyra` checkout.
The working branch is `release/0.2.8`; the public release API serves `0.4.3`.
The newer release was reviewed directly with `git show v0.4.3:<source>` without
switching branches or altering the existing worktree. Current release evidence
therefore takes precedence over the older branch's missing Agent/Chat surfaces.
`/home/ellis/Desktop/SaaS` is retired; its vault and deleted Electron sources are
not the current product. This is a cross-surface product and marketing review,
not a line-by-line security audit or a certification of every runtime.

## Positioning

**An agentic coding workspace for people with things to build.** Lead with the
vibecoder's outcome: turn an idea into working software, see the result, iterate.
Then show the developer's reasons to trust it: real terminals, existing repos,
agent choice, Git worktrees, diffs, and explicit review.

Desktop is the available product. Phone is a prominent companion experience,
with its release status explained beside the visual. Avoid implying that the
current native desktop already supports the retired bridge's phone controls.

## Product evidence and copy boundaries

| Surface | Source reviewed | Website treatment |
| --- | --- | --- |
| Native desktop | `desktop-tauri/src/components/layout/ProjectWorkspace.tsx`, `components/terminal/`, Rust command registry | Native desktop workspace; per-project terminal sessions and flexible layouts. |
| Agent and Chat modes | `v0.4.3:desktop-tauri/src/components/layout/WorkspaceApp.tsx`, `ModeSwitch.tsx`, `components/agentMode/{AgentDashboard,AgentRail,NewAgentDialog,SkillsPanel,ChatMode}.tsx`, Rust `agent_runtime/capabilities.rs` | Persistent teammates with briefs, memory, granted folders, assigned skills, controlled handoffs, decisions; standalone chats. Compatible Claude Code/Codex required. Code Mode terminals remain mounted when switching. |
| Routines and approval scope | `v0.4.3:desktop-tauri/src/components/agentMode/{RoutineScheduleFields,PermissionPicker}.tsx`, agent approval modules | Daily, selected-day or interval routines while the app is open; Plan/Standard/Full access and supported approval decisions. No always-on cloud worker or blanket sandbox guarantee. |
| Agent choice | `src-tauri/crates/vibyra-core/src/agents/catalog.rs`, provider account commands | Claude Code, Codex, Gemini, Aider, OpenCode, Qwen Code; installed CLIs and their provider requirements apply. No promise of every model or included provider subscriptions. |
| Preview | `components/preview/PreviewWorkspace.tsx`, `PreviewToolbar.tsx`, Rust preview modules | Run supported projects locally and inspect different CSS viewport sizes. Do not describe viewport presets as native-device emulation. |
| Code ownership and review | `workspace.rs`, `workspace_preflight.rs`, `commands/review.rs`, `commands/github.rs` | Optional isolated Git worktrees; review, merge/discard, GitHub PR flow. Safe mode is not an OS sandbox. |
| Project dock | `components/dock/Dock.tsx`, memory and screenshot commands | Files, AI chat, project notes/Obsidian, review, screenshots. Avoid claiming a full Monaco editor in the current Tauri dock. |
| Voice | `commands/voice.rs` | Linux dictation requires ALSA recorder and configured AI service; transcription is cloud-based. No universal offline voice claim. |
| Phone AI | `src/context/useAgentActions.ts`, `agentModeDecisions.ts`, `src/screens/workspace/inline/` | Project-aware chat, planning, generated-app previews, and community discovery are implemented source paths. Public install access remains unverified. |
| Phone pairing | `usePairingConnectionActions.ts`, `pairingDiscovery.ts`, native command registry | Phone bridge client remains; native Tauri has no matching pairing HTTP server in this checkout. Connected PC control must remain upcoming, not a shipped claim. |
| Account and community | `backend/routes/web.php`, phone workspace surfaces | Shared account, project context, cloud AI, usage/billing, sessions, community project publishing and discovery. Do not promise arbitrary production deployment. |
| Pricing | `backend/config/billing.php`, `/api/billing/plans` | Fetch authoritative plans. No duplicate fallback prices. Show monthly/annual totals, credits and project limits with loading/error/retry states. |
| Downloads | `ReleaseDownloadController`, `/web-api/download-catalog`, standalone downloads page | Keep public `/downloads` flow and availability checks. Live metadata on review date reported Windows/Linux 0.4.3; macOS unavailable. Never hardcode release versions in marketing. |
| Website | `marketing.blade.php`, marketing React/CSS, `scripts/serve-website.mjs` | Use existing Laravel homepage and cookie-auth portal routes. No new application framework, payment flow, or fake lead-collection form. |

## Design and content plan

1. **First impression:** oversized editorial typography on a pearl canvas;
   graphite product stage, cobalt accents, desktop plus phone composition.
   One clear download CTA and a jump into the interactive walkthrough.
2. **Product proof:** a deliberately labelled illustrative workspace. Accessible
   tabs switch terminals, responsive preview, and Git review; the visitor can
   inspect actual workflow concepts without running commands or contacting AI.
3. **Agent choice:** a restrained provider strip, described as supported CLI
   choices rather than customer endorsements.
4. **Desktop depth:** six compact feature stories covering parallel terminals,
   previews, memory, screenshots, voice, and code review. Audience switch connects
   the same tools to vibecoders and experienced developers.
   An Agent/Code/Chat walkthrough first explains persistent teammates, skills,
   recurring routines, approval decisions and detached conversations.
5. **Phone:** a full dedicated composition and interactive phone preview for
   chat, generated preview, and Explore. Clear forthcoming public access and
   separate qualification for desktop connection.
6. **Control:** explain local execution, Git review and cloud/provider boundaries
   in ordinary language. Avoid blanket privacy or security guarantees.
7. **Pricing:** existing backend catalogue, four plans, billing toggle, real
   signup/billing destinations, clear provider-account distinction.
8. **FAQs and conversion:** installation, phone status, model accounts, existing
   repos, ownership, safe mode, previews, credits. Final download action plus
   real account, privacy and terms links.

## Design review

Keep the established Graphite + Cobalt brand. Use large whitespace, fine rules,
sharp hierarchy, carefully drawn software surfaces, and restrained motion.
Do not add fake testimonials, customer counts, performance multipliers,
nonfunctional prompt inputs, unsupported store badges, or auto-playing films.
The user requested comprehensive software and phone coverage; this replaces the
older abbreviated homepage and scroll-film direction. Legacy film source stays
available without shipping in the new homepage bundle.

For market context, the current [Cursor homepage](https://cursor.com/) makes its
agent interface the proof; [Lovable](https://lovable.dev/) and
[Replit](https://replit.com/) foreground the act of building an app. The inference
for Vibyra is to pair that approachable outcome with its own multi-CLI desktop
workspace, rather than copy a competitor's layout or claims.

## Implementation checkpoints

- Build focused React sections and CSS modules within the existing Vite entry.
- Keep every new first-party source module under 200 lines.
- Preserve account, billing, release and product-client behavior.
- Build production assets and run the retained marketing regression checks.
- Verify the real localhost page in Chromium at desktop and narrow widths;
  exercise walkthrough tabs, preview sizes, phone tabs, audience switch,
  billing toggle, FAQ, mobile navigation, links, and error/retry behavior.
- Check asset loads, console errors, horizontal overflow, keyboard controls,
  reduced motion, headings and accessible names.
- Record the final ownership and availability rules in the active Obsidian
  vault and the smallest applicable local skill.

## Local run

From the active repo root: `npm run website`.
Website: `http://127.0.0.1:8128`; Laravel upstream: port `8129`.
Build changed assets with `npm run build` from `backend/` before reloading.
Verify page content and asset types before returning the URL; port `8000`
belongs to another local project in this environment.

Homepage CTAs use same-origin `/downloads` so local previews include the new
downloads design. The local checkout has no usable installer artifacts:
`WebsiteDownloadsController` reads public release metadata in Laravel's `local`
environment, and installer links use the public artifact routes. Other
environments use the existing release controller and same-origin file routes.
Release integrity gates are unchanged. See [the downloads redesign](downloads-website-redesign.md).

## Delivered and checked

The homepage includes both software and phone experiences, Agent/Code/Chat
mode demonstrations, six desktop capabilities, audiences, control explanations,
API-driven plans and eleven FAQs. Browser-generated social artwork, local
licensed fonts, keyboard controls, reduced-motion handling and semantic metadata
are included. The live phone story remains clearly forthcoming.

Production asset build and the two retained legacy marketing regressions pass.
The Chromium check captures 320, 390, 600, 768, 1024, 1440 and 1920px layouts, checks for
overflow and missing images, and exercises the user-visible controls and links.
WCAG A/AA axe checks cover the initial desktop/mobile screens and secondary
preview/chat/FAQ states. The QA command is:

```bash
npm install --prefix /tmp/vibyra-marketing-qa playwright @axe-core/playwright
NODE_PATH=/tmp/vibyra-marketing-qa/node_modules node scripts/marketing/verify.mjs
```

Artifacts and `verification.json` are written under `/tmp/vibyra-marketing-qa`.
This validates the marketing site; it does not certify every native product
feature or an end-to-end phone connection. No deployment was performed.

## Refinement pass

- Increased marketing body text and control sizes while preserving the scale
  of the illustrative product composition. Tablet artwork stays within its
  stage, and medium-width pricing uses two readable columns.
- Added an expanded Build/Preview/Review tour with responsive panels, real
  viewport controls, keyboard navigation, focus containment and restoration,
  Escape/backdrop dismissal, and focusable code scrolling. Tiny viewport
  buttons are hidden in the narrow inline illustration; the tour owns them.
- Added three concrete first-project steps for each audience. The hero now
  names the agentic coding workspace directly. Phone availability and
  provider-account requirements remain explicit.
- Converted the three licensed font faces to WOFF2: 285,588 to 90,232 bytes
  (68.4% smaller). Preloaded regular/bold. Removed unused legacy utility
  generation: marketing CSS is about 65.7 KB, including the added tour styles,
  compared with roughly 96.7 KB before refinement.
- The expanded-tour helper covers desktop, 390/320px phones and short landscape
  layouts, including repeated opening, close focus/scroll cleanup and keyboard
  access to horizontally scrolling code. Native dialog close checks wait for
  actual DOM removal, because closed dialogs leave the accessibility tree
  before their React close handler unmounts them.

Final refinement validation passed: seven responsive widths, all tour steps,
preview sizing, keyboard focus and scrolling, navigation, billing cycles, actual
download destination, and pricing failure/retry. The five axe reports (initial
desktop/mobile, desktop/mobile tour, and secondary page states) contain no
violations. The final artifact set is `/tmp/vibyra-marketing-qa/final/`.
