# Vibyra Marketing Website Master Plan

> [!info] Current implementation map
> Read [[Product Surfaces]] for the live boundary between the public website,
> Expo browser client, native phone app, and Electron desktop companion. This
> document remains the deeper content and rollout plan.

> [!success] Homepage implementation — 2026-07-17
> The live Laravel homepage now follows [[Homepage Redesign Implementation Plan]].
> It preserves the immersive scroll-video hero, uses current product captures
> for terminal/team/voice/memory/model proof, uses generated photography only
> as atmosphere, and includes a compact full-capability atlas. The approved
> marketing palette is now Graphite + Cobalt from
> [[Design/Graphite And Cobalt Colour System]]; older purple/pink art-direction
> passages below are retained as historical planning context, not current rules.

Status: planning only; no implementation authorized by this document.

Last reviewed: 2026-07-13

## 1. Purpose

Create the public website that explains, proves, and converts demand for Vibyra across its phone app, desktop application, local bridge, AI terminal workspace, account/billing system, and community/publishing layer.

The website must answer, in order:

1. What is Vibyra?
2. Why is it different from Cursor Mobile, Claude Code Remote Control, Happy, Replit, and generic AI app builders?
3. What can a person actually do with it today?
4. What stays on the computer, what uses Vibyra's cloud, and what needs approval?
5. Which phone and desktop platforms are genuinely available?
6. How much does it cost?
7. What is the smallest safe next step: join the waitlist, create an account, download, or install?

The site is not a replacement for the desktop product, a generic company brochure, an investor deck, or an exhaustive feature dashboard.

## 2. Product Truth Learned From The Repository

### 2.1 Product definition

Vibyra is a cross-device AI software workflow system:

- The phone app is the portable command and review surface.
- Vibyra Desktop owns local project discovery, terminals, files, previews, screenshots, and permissioned actions on the user's computer.
- The Laravel backend owns accounts, sessions, cloud state, billing, credits, model routing, team planning, project memory, community publishing, moderation, hosted demos, and referrals.
- Pairing links a phone and desktop using the same Vibyra account plus explicit approval on both devices.

Recommended plain-language category:

> Your AI coding workspace, connected across phone and desktop.

Recommended sharper campaign line:

> Keep your builds moving when you leave your desk.

Do not make “mobile cockpit” the only public category phrase. It is accurate but developer-insider language. Use it selectively in technical, comparison, and launch content.

### 2.2 Real phone product surface

The phone application currently supports or visibly models:

- Email, Google, and Apple authentication.
- Optional Face ID, Touch ID, or device-passcode app lock.
- Guided discovery and pairing with Vibyra Desktop on the same account.
- New chat, project chats, recent chats, projects, Explore, and account surfaces.
- Local desktop project discovery and Browse PC.
- Project-specific briefs and detected project context.
- AI chat with model and reasoning selection.
- Image/file attachments, image generation, web search, deep research, and file analysis paths.
- Workflow commands including Plan, Debug, Review, Design, Ship, Publish, and Explain.
- Permission prompts for desktop connection, preview server startup, and file edit application.
- AI-generated code changes with approve, deny, undo, and preview recovery states.
- Live/generated preview surfaces.
- Project creation, project search/filtering, pin/archive/rename, and publishing.
- Explore/community discovery with search, filters, likes, comments, bookmarks, reports, and hosted demos.
- Profile, billing, usage, device sessions, referrals, language, notifications, support, privacy/security, cache, logout, and account deletion.

### 2.3 Real desktop product surface

The desktop application currently supports or visibly models:

- A real authenticated Electron shell, with email, Google, and Apple account flows.
- Terminal-first information architecture; Terminals and Projects are the primary destinations.
- Project discovery and a Finder-like project chooser.
- Independent-agent and coordinated-team terminal setup.
- Up to 12 terminal sessions in focus or explicit grid layouts, with plan entitlements limiting concurrent AI agents.
- Official/native account paths for supported AI CLI families and Vibyra-credit model routing.
- Current runtime catalogue work around Codex, Claude, Gemini, Qwen, Kimi, Mistral Vibe, and Grok Build; every model/provider claim still requires release verification.
- Project-bound terminals, a Full PC scope, safe/shared workspaces, separate branches, and explicit full-access opt-in.
- Persistent detached terminal workers that survive renderer refresh and desktop-window lifecycle events.
- A unified right workspace with Editor, Preview, AI Chat/Talk, and Memory.
- Monaco-based editing and project file exploration.
- Preview detection, explicit run approval, real startup output, device presets, diagnostics, and Fix with AI routing.
- Local screenshot capture, crop/annotation, Copy/Save, and drag-to-terminal/chat workflow.
- Voice chat with Vibyra plus separate terminal dictation.
- Project memory import and an Obsidian-style graph/notes workspace.
- Phone pairing, device approval, account settings, AI account connection, billing, theme, voice, language, and signed-in-device management.

### 2.4 Real backend and commercial surface

- Free: 50 credits/month, 1 active project, zero configured concurrent paid agents; UI/backend behavior must be reconciled before marketing the free tier's agent allowance.
- Starter: £20/month or £225/year, 350 monthly credits, 1 active project, 1 concurrent agent.
- Builder: £49/month or £585/year, 1,000 monthly credits, 3 active projects, 2 concurrent agents.
- Pro: £99/month or £1,170/year, 2,000 monthly credits, 10 active projects, 4 concurrent agents.
- Prices are configured in GBP and the plans API declares VAT-inclusive pricing.
- Credit top-ups are configured at 500 for £20, 1,500 for £58, and 4,000 for £152.
- Stripe, Apple IAP, and Google Play receipt paths exist.
- Backend functionality also includes device/session management, credit limits, moderation, referrals, project publishing, hosted demos, and project memory.

Pricing shown on the marketing site must come from the authoritative plans API or a shared server-side catalogue. Do not maintain a third independent hardcoded pricing table.

### 2.5 Current public website reality

- A dedicated public marketing homepage is implemented at Laravel `GET /` via
  `marketing.blade.php`, `resources/js/marketing/`, and `marketing.css`.
- The wider launch sitemap later in this plan is still planned; do not describe
  `/product`, `/desktop`, `/mobile`, or other pages as shipped until routes exist.
- Legacy desktop application routes are separately guarded by
  `desktop.legacy_routes_enabled`; they do not own the public root route.
- The mobile onboarding links users to `https://vibyra.ai`, while product/legal/support links use `vibyra.app` and `links.vibyra.app`.
- Domain ownership and canonical host strategy therefore need an explicit decision before build work.
- Existing README screenshots and source artwork are useful raw material but do not yet prove the complete current product.

## 3. Claim Safety Register

Every public claim must be assigned one of these states in the website content model:

- `verified`: demonstrated in a release build and allowed on public pages.
- `qualified`: true only with a named platform, plan, provider, or setup condition.
- `beta`: functional but not yet a dependable default; label it.
- `planned`: roadmap only; never use as present-tense product copy.
- `blocked`: contradicted by source/configuration or missing release evidence.

### 3.1 Safe core claims after release verification

- Connect a phone to Vibyra Desktop with explicit approval.
- Discover and work with projects on the user's computer.
- Start and continue AI-assisted software work across desktop and phone.
- Review project context, proposed edits, and previews from the phone.
- Run multiple terminal workspaces and coordinated agent teams on desktop.
- Choose between Vibyra credits and supported connected AI accounts where the selected runtime permits it.
- Keep local filesystem operations on the paired computer.
- Use explicit approval gates for sensitive local actions.
- Import project notes into a project-memory workspace.
- Publish supported projects to an Explore/community surface.

### 3.2 Claims that require qualification

- “Local-first”: local files and commands are local, but authentication, billing, cloud state, model routing, memory, publishing, and some AI requests use backend/cloud services.
- “Your code stays on your machine”: too broad unless every model path, attachment path, logging path, publishing path, and cloud sync path is excluded. Prefer: “Your projects run on your computer; Vibyra tells you when a workflow needs cloud AI or publishing.”
- “Works anywhere”: the desktop must be running and reachable; local discovery/pairing starts on the same network and remote behavior must be release-tested.
- “Any AI model” or “any agent”: current code has a defined runtime catalogue, not unlimited compatibility.
- “Works with Cursor” or “works with Aider”: older research says this, but current audited runtime/product code does not establish it as a supported integration.
- “iPhone and Android”: both Expo platform configs exist, but store availability must be confirmed independently.
- “Windows, macOS, and Linux”: Windows and Linux have explicit launcher/runtime work; macOS compatibility exists in code paths but needs packaging and end-to-end release evidence.
- “Secure”: replace with concrete mechanisms such as same-account pairing, explicit approval, scoped capability tokens, device-session controls, and app lock.
- “Real-time”: use only if measured under supported network conditions.
- “Publish to production”: supported static/hosted-demo paths exist, but framework coverage and production guarantees must be stated precisely.

### 3.3 Prohibited launch copy until proven

- “Your code never leaves your machine.”
- “Control any coding agent.”
- “Works with Cursor, Aider, and every custom backend.”
- “The only mobile AI coding app.”
- “Fully autonomous.”
- “No setup.”
- “Ship production apps from anywhere” without qualification.
- Unverified user counts, speed improvements, uptime, revenue, review scores, security certifications, customer logos, or testimonials.
- Fake terminal output, fake agent progress, fake published projects, or invented performance metrics.

## 4. Market Position And Differentiation

### 4.1 Current competitive reality

- Cursor now markets native iOS, local Remote Control, cloud agents, voice, artifacts, diffs, and PR merging.
- Cursor's earlier web/mobile agents also support multi-agent background work and desktop handoff.
- Happy markets phone control of Claude Code running on the user's own hardware.
- Replit markets building websites and apps directly from phone and cloud.
- Anthropic has also moved Claude/Code workflows onto mobile and web.

Therefore “use an AI coding agent from your phone” is not a defensible standalone position.

### 4.2 Vibyra's defensible combined story

Vibyra should compete on the combination of:

1. One connected product across phone and desktop, rather than a thin remote terminal.
2. Real local project discovery and project-bound workspaces.
3. Desktop terminal orchestration across supported model/runtime families.
4. A mobile review-and-approval loop for real local projects.
5. Live preview and preview diagnostics built into the same workflow.
6. Explicit permission boundaries and visible local/cloud distinctions.
7. Project memory, editor, voice, screenshot, publishing, and community workflows in one system.

No single feature should be called “unique” without a fresh competitor evidence review. Sell the coherent workflow, not an unsupported exclusivity claim.

### 4.3 Primary audience

Lead audience: developers, technical founders, indie hackers, and AI power users who already use coding agents and want to keep real work moving away from their desk without surrendering local project context.

Secondary audiences:

- Multi-agent users who need one place to launch and monitor supported providers.
- React Native/Expo and web developers who value phone-visible preview loops.
- Small teams and agencies that want explicit review and permission boundaries.
- Privacy-conscious builders who prefer local execution but accept clearly disclosed cloud AI/account services.

Do not lead with total beginners. Vibyra's current setup, local desktop dependency, model/account options, and permission model are a stronger match for serious builders. Beginner-friendly education can be a later funnel.

## 5. Messaging System

### 5.1 Recommended homepage message

Eyebrow:

> Vibyra for phone + desktop

Headline:

> Keep your AI builds moving when you leave your desk.

Subhead:

> Run supported AI coding work on your computer, follow it from your phone, review changes, and open live previews—all in one connected workspace.

Primary CTA is release-state dependent:

- Pre-release: `Join the private beta`
- Mobile released, desktop not packaged: `Get early access`
- Both released: `Download Vibyra`

Secondary CTA:

> Watch the 60-second workflow

Truth line below CTA:

> Vibyra Desktop is required for local projects. Cloud AI and account features are clearly identified.

### 5.2 Message hierarchy

1. Outcome: continue real AI software work away from the desk.
2. Mechanism: phone and desktop stay connected to the same project workflow.
3. Proof: prompt → desktop terminal/agent → proposed changes → approval → preview.
4. Control: explicit approvals, supported provider/account choices, visible local/cloud boundaries.
5. Breadth: terminals, teams, editor, preview, memory, voice, screenshots, publishing.
6. Commercial: free entry point and paid plans for more credits/projects/agents.

### 5.3 Voice

- Direct, capable, precise, and calm.
- Developer-respectful without drowning the homepage in implementation terms.
- Short sentences around the demo.
- Concrete verbs: connect, open, run, review, approve, preview, continue.
- Avoid hype words such as revolutionary, limitless, magical, autonomous, or game-changing.
- Always spell the product `Vibyra`; treat `Vibera` as a typo, not a rebrand.

## 6. Conversion Strategy

### 6.1 One primary funnel

The site should have one launch-state-aware conversion funnel:

`Homepage proof → How it works → Platform/setup check → Account/download or waitlist → Guided first connection`

Do not present App Store, Play Store, Windows, macOS, Linux, GitHub, and email CTAs as equal choices in the hero.

### 6.2 CTA state machine

The website needs a centrally configured release matrix:

- Phone: iOS `unavailable | beta | public`; Android same.
- Desktop: Windows, macOS, Linux with the same states.
- Account creation: closed, invite-only, or open.
- Beta capacity: open or paused.

CTA behavior must be derived from this matrix. Example:

- Visitor on Windows + iPhone, both public: primary `Download for Windows`, next step offers iOS.
- Desktop public but phone beta: primary `Download Desktop`, secondary `Join iPhone beta`.
- Unsupported platform: `Join the platform waitlist`; never offer a dead download.

### 6.3 Conversion events

Track at minimum:

- Hero primary/secondary CTA clicks.
- Demo play, 25%, 50%, 75%, complete.
- Platform selection and unsupported-platform interest.
- Download start and download success page view.
- Waitlist start/completion.
- Pricing view, plan toggle, and plan CTA.
- FAQ expansion.
- Comparison-page CTA.
- Docs/setup start and pairing-success attribution where privacy rules permit.

No keystroke recording, session replay, or cross-site ad tracking by default. Obtain consent where required and document analytics retention.

## 7. Information Architecture

### 7.1 Global navigation

Keep top navigation compact:

- Product
- How it works
- Pricing
- Security
- Resources
- `Download` or `Join beta` primary action

Resources menu:

- Docs
- Comparisons
- Changelog
- Status
- Support

Footer:

- Product: Features, How it works, Pricing, Download, Changelog
- Resources: Docs, Guides, Comparisons, Community/Explore when public
- Company: About, Contact, Press kit
- Trust: Security, Privacy, Terms, Acceptable use, Subprocessors, Status
- Platforms: only verified platform/store links

### 7.2 Required launch pages

1. `/` Homepage
2. `/product` Product overview
3. `/how-it-works` Cross-device workflow
4. `/desktop` Desktop application
5. `/mobile` Phone application
6. `/pricing` Plans and credit explanation
7. `/security` Trust, permissions, and local/cloud boundaries
8. `/download` Platform-aware download/install page
9. `/docs/getting-started` Minimum viable setup documentation
10. `/comparisons` Comparison hub with evidence policy
11. `/legal/privacy`
12. `/legal/terms`
13. `/support`
14. `/status` or a clearly linked external status page

### 7.3 Phase-two pages

- `/features/ai-terminals`
- `/features/live-preview`
- `/features/phone-control`
- `/features/project-memory`
- `/features/agent-teams`
- `/features/publishing`
- `/compare/cursor-mobile`
- `/compare/claude-code-remote-control`
- `/compare/happy-coder`
- `/compare/replit`
- `/blog` or `/guides`
- `/community` only when real public content is consistently available
- `/roadmap` only if the team will maintain it honestly

## 8. Homepage Blueprint

### Section 1: Navigation

- Vibyra mark and wordmark.
- Five or fewer navigation choices.
- One primary CTA.
- No announcement bar unless there is a time-limited, real announcement.

### Section 2: Hero

- Recommended headline/subhead from Section 5.
- Primary and secondary CTA.
- One short product truth line.
- Hero media must show the actual phone and desktop together.
- Default frame: phone sends a project-bound task while the desktop terminal is actively working.
- Avoid a static collage of unrelated screens.

### Section 3: The 15-second proof loop

An autoplay-muted, user-controllable, captioned sequence:

1. Choose a real project on phone or desktop.
2. Send a concrete task from the phone.
3. Desktop terminal/agent begins work.
4. Phone shows a real status or approval request.
5. User reviews/applies changes.
6. Live preview opens with the result.

Use real captured output. The complete workflow should also be available as a 60–90 second expanded demo.

### Section 4: “Your computer does the work. Your phone keeps you in control.”

Use a simple cross-device diagram:

- Phone: prompts, review, approve, preview.
- Desktop: projects, files, terminals, commands, local runtimes.
- Vibyra account/cloud: sign-in, billing, sync, supported AI routing, memory, publishing.

This is the most important trust explanation on the homepage. It prevents the false impression that everything is local or everything is uploaded.

### Section 5: Three core outcomes

Only three cards/rows:

1. `Keep work moving` — continue project-bound work away from the desk.
2. `See what changed` — review approvals, files, and previews before accepting work.
3. `Use the right workspace` — supported providers, independent agents, or coordinated teams on desktop.

Each outcome requires one real screen capture and one sentence. Do not show a 12-item feature grid.

### Section 6: Desktop depth

Show the actual terminal-first product:

- Project tabs and agent rows.
- Independent vs coordinated setup.
- Focus/grid workspace.
- Editor, Preview, AI, and Memory switcher.
- Explicit safe/full access distinction.

Copy must make clear that Vibyra Desktop is a full workspace, not a headless bridge installer.

### Section 7: Phone depth

Show the portable workflow:

- Secure pairing.
- Projects/Browse PC.
- Project chat and context.
- Approval/change card.
- Live preview.
- Explore/publishing only if launch-ready and populated.

### Section 8: Control and trust

Four evidence-led points:

- Same-account, two-sided phone/desktop approval.
- Sensitive local actions require explicit permission according to mode.
- App lock and signed-in-device management.
- Plain-language local versus cloud data map.

Link to `/security`; never replace evidence with lock icons and “enterprise-grade” wording.

### Section 9: Supported models/accounts

- Render only providers/runtimes verified in the release matrix.
- Separate `Use Vibyra credits` from `Use supported connected AI accounts`.
- Use provider trademarks according to their brand rules.
- Add “availability varies by runtime, platform, plan, and provider account.”

### Section 10: Pricing preview

- Show Free, Starter, Builder, Pro in a compact comparison.
- Highlight Builder only if it is the intended default and economics support it.
- Explain credits in one plain sentence and link to a calculator/FAQ.
- Monthly/annual display must not imply a false annual saving: current annual totals are only slightly below 12 monthly payments.
- Pull figures from the authoritative catalogue.

### Section 11: FAQ

Minimum questions:

- Does Vibyra replace my coding agent or IDE?
- Does my computer need to stay on?
- What stays local and what uses the cloud?
- Which AI providers and accounts are supported?
- Which phone and desktop platforms are available?
- Can Vibyra work outside my home network?
- What actions require approval?
- How do credits work?
- Can I cancel any time?
- What happens if the desktop disconnects?

### Section 12: Final CTA

Repeat the single release-state-aware CTA with one setup expectation:

> Install Vibyra Desktop, add the phone app, and connect them with your Vibyra account.

## 9. Supporting Page Requirements

### 9.1 Product page

Organize by workflow, not internal modules:

1. Connect devices.
2. Open a real project.
3. Choose a model/account and workspace.
4. Ask, plan, build, debug, or review.
5. Approve sensitive actions and edits.
6. Inspect files and previews.
7. Continue on phone or desktop.
8. Preserve project context and optionally publish.

Include a `Works today / Beta / Planned` label system.

### 9.2 How it works page

- Prerequisites and supported platforms.
- Account creation.
- Desktop install.
- Phone install.
- Same-account discovery and explicit pairing.
- Local project selection.
- First safe task.
- Approval and preview.
- Disconnect/reconnect behavior.
- Troubleshooting links.

The page should be readable as both marketing proof and onboarding preparation.

### 9.3 Desktop page

Lead with terminal orchestration and real local projects. Cover Projects, independent agents, coordinated teams, Editor, Preview, AI/Talk, Memory, screenshots, permissions, themes, and provider accounts. Include verified OS requirements and installer formats.

### 9.4 Mobile page

Lead with review/control rather than “full IDE in your pocket.” Cover pairing, project chats, approvals, live preview, Browse PC, Explore/publishing, account/security, and offline/disconnected limitations. Provide verified App Store/Play Store status.

### 9.5 Pricing page

- API-backed plan table.
- Monthly/annual toggle.
- Credits, daily caps, project limits, concurrent-agent limits, model tiers, and top-ups.
- Examples of credit consumption must use measured ranges and a date stamp.
- VAT/currency explanation.
- Stripe/App Store/Google Play management differences.
- Cancellation and refund links.
- No hidden “contact sales” tier unless it exists operationally.

### 9.6 Security page

Required sections:

- Architecture and data-flow diagram.
- Data inventory by phone, desktop, backend, AI provider, publishing, and analytics.
- Pairing and token model.
- Approval model and permission modes.
- Local file/path handling.
- Encryption in transit/at rest claims with evidence.
- Session/device revocation.
- Account deletion and retention.
- Provider/subprocessor list.
- Vulnerability reporting contact and response policy.
- Known limitations and beta notices.

Do not launch this page until security/legal owners have signed off on every claim.

### 9.7 Comparison pages

Every comparison must:

- Use a “last verified” date.
- Link to official competitor sources.
- Compare the same user job, not cherry-picked feature counts.
- Separate local control, cloud agents, supported models, preview, diffs, PRs, voice, project memory, desktop depth, mobile depth, pricing, and platform availability.
- Use `Yes`, `No`, `Limited`, `Beta`, or `Unknown`; never guess.
- Include “best for” summaries that may honestly recommend the competitor.

Initial angle:

- Cursor Mobile: choose Cursor for deep Cursor-native local/cloud continuity; choose Vibyra when the verified release offers a broader Vibyra desktop workflow across supported runtimes, project memory, and integrated local preview/review.
- Claude Remote/Happy: choose them for Claude-specific continuity; choose Vibyra for the verified multi-runtime Vibyra workspace and broader phone/desktop product loop.
- Replit: choose Replit for cloud-first creation/deployment; choose Vibyra for existing local projects and a connected personal computer workflow.

## 10. Visual Direction

### 10.1 Brand system

- Use `src/assets/vibyra.png` as the canonical in-product mark reference.
- Preserve the violet `#7B2CFF`, pink `#FF35C8`, and amber `#FFB84D` logo palette.
- Use the desktop graphite system as the product-frame foundation: `#121214`, `#17171B`, `#19191D`, `#222226`.
- The marketing site may use more breathing room and editorial typography than the app, but it must still look like the same product.
- Purple is for primary action, focus, AI identity, and meaningful state—not every card and heading.

### 10.2 Page composition

- Dark-first launch site with an accessible light or system option only if the complete site is audited in both themes.
- Large editorial sections, restrained card use, modest radii, neutral dividers.
- Product screenshots should dominate decorative illustration.
- Use motion to explain state transfer between phone and desktop, not as ambient glow.
- Avoid generic AI orbs, star fields, fake code rain, floating glass cards, and dashboard statistics.

### 10.3 Required production assets

Create a capture list before design:

- Phone auth and connection flow.
- Phone project chat with a real task.
- Phone edit approval and preview.
- Phone Projects and Explore.
- Desktop project list.
- Independent-agent setup.
- Coordinated-team planning and running terminals.
- Desktop Editor + Preview.
- Desktop Memory graph/notes.
- Desktop phone pairing and permission state.
- Screenshot capture workflow.
- Light and dark desktop proof if both are marketed.

For each asset store: product version/commit, OS/device, data-fixture source, capture date, claim it supports, accessibility alt text, and whether it is safe for public use.

Never capture personal paths, real email addresses, tokens, unpublished customer code, or fake metrics. Use a polished purpose-built demo repository.

### 10.4 Current SaaS frontend reference research

Research date: 2026-07-13. Re-check every live reference before implementation because these sites change frequently.

| Reference | Pattern worth learning | Vibyra adaptation | Do not copy |
| --- | --- | --- | --- |
| [Linear](https://linear.app/) | One precise category statement, a large real-product composition, then numbered workflow chapters backed by detailed product UI. The page makes software screens the visual language rather than adding unrelated illustration. | Turn the Vibyra homepage into a chaptered cross-device story: Connect, Direct, Review, Preview. Give each chapter one real product state and one concise outcome. | Linear's grayscale identity, dense issue-management examples, figure-number styling, or exact section composition. |
| [Cursor](https://cursor.com/) | Realistic interactive IDE demonstrations, authentic task/output details, and product proof that continues below the hero instead of switching to generic feature icons. | Use a controlled Vibyra workflow playback with authentic terminal, approval, changed-files, and preview states. Let users pause and scrub it, but do not allow a fake prompt to imply a live browser product. | Cursor's IDE chrome, typography, orange/cream palette, mission-control language, or unsupported cloud-agent claims. |
| [Raycast](https://www.raycast.com/) | Strong one-line promise, platform-aware download CTA, a memorable keyboard metaphor, and energetic but product-specific storytelling. | Build Vibyra's memorable visual metaphor around a task travelling between phone and desktop. Make the CTA platform-aware and make every motion reinforce connection or progress. | The keyboard spectacle, inflated animation density, playful styling that would undermine Vibyra's calm technical trust, or reliability figures without Vibyra evidence. |
| [Vercel](https://vercel.com/) | Strict grid, high-contrast typography, restrained palette, large editorial statements, customer proof embedded beside specific platform capabilities, and consistent section rhythm. | Use a structural graphite grid, thin neutral rules, strong type scale, and evidence beside the capability it proves. | Vercel's black/white identity, triangle motifs, overly broad mega-navigation, or enterprise tone before Vibyra has enterprise operations. |
| [Warp](https://www.warp.dev/) | Developer-native language, terminal-centred visuals, clear flexibility/configuration story, and technical proof close to the hero. | Let desktop terminals feel authentic and keep supported provider/account choices visible as a release-verified matrix. | “Any agent/model/tool” positioning, huge statistic blocks, or Warp's green/terminal branding. |
| [Replit](https://replit.com/) | The first viewport is an action: a prompt plus output type. Follow-up sections use short verbs and large working-product examples. | Make Vibyra's first viewport an understandable workflow stage with one obvious action: play the phone-to-desktop build loop. Use concise verbs such as Connect, Ask, Review, Preview. | A working prompt box, “no coding needed,” cloud-first creation language, or a long catalogue of build types. |
| [Lovable](https://lovable.dev/) | Very short three-step story—start with an idea, watch it become real, refine and ship—plus visually appealing output examples. | Keep the homepage journey simple despite Vibyra's depth: connect, direct, approve, see the result. Use one beautiful demo project consistently. | Template-gallery positioning as the main story, generic “chat with AI” copy, or one-click deployment promises. |
| [Bolt](https://bolt.new/) | Immediate build CTA, design-system proof, strong visual examples, and progressive expansion from agent to infrastructure. | Show Vibyra's real UI/design continuity across phone and desktop and reveal deeper capabilities only after the core workflow is understood. | Unsupported performance statistics, excessive superlatives, cloud-infrastructure bundling language, or its exact split hero. |

Reference synthesis:

1. The best sites place the product or starting action in the first viewport.
2. They repeat a stable visual grammar instead of introducing a new card style in every section.
3. Long pages feel shorter when divided into named or numbered workflow chapters.
4. Motion is most convincing when it demonstrates causality: input, work, result.
5. Authentic interfaces outperform abstract AI imagery for developer audiences.
6. The strongest conversion pages make one next action obvious and hide secondary paths.

### 10.5 Vibyra marketing design concept: Connected Momentum

Working art-direction name: `Connected Momentum`.

The website should make a visitor feel that work is moving continuously between two trusted surfaces:

- Phone: intent, review, approval, and portable visibility.
- Desktop: real project, terminal work, files, diagnostics, and local execution.
- Connection line: a restrained Vibyra-coloured signal showing the active relationship.

The connection signal is the site's distinctive motif. It may appear as:

- A thin violet-to-pink-to-amber path between phone and desktop in the hero.
- A small travelling point when a prompt, approval request, or preview crosses devices.
- A short edge pulse on the destination frame when state arrives.
- A static dotted line in reduced-motion mode.
- A subtle path reused in section dividers and the architecture diagram.

It must never become a decorative neon cable, infinite glowing wave, or full-page particle background. The signal exists only when it explains a real state transition.

### 10.6 Layout system

#### Global frame

- Maximum editorial width: `1440px`.
- Main content width: `1200px` to `1280px` depending on section.
- Reading width: `640px` to `720px`.
- Desktop side gutters: `32px` minimum, growing fluidly to `64px`.
- Tablet gutters: `24px`.
- Phone gutters: `18px` to `20px`.
- Use a 12-column desktop grid, 8-column tablet grid, and 4-column phone grid.
- Use one thin vertical guide at each main content edge and occasional horizontal rules. Do not expose the entire construction grid behind every section.

#### Vertical rhythm

- Hero top clearance below navigation: `88px` to `120px`.
- Major section spacing: `144px` desktop, `104px` tablet, `80px` phone.
- Section heading to visual: `48px` desktop, `32px` phone.
- Related content spacing: multiples of `8px`, with `16`, `24`, `32`, `48`, `64`, `96`, and `144` as the main scale.
- Keep the overall page long enough to prove the product, but not longer than the evidence. Remove any section that repeats an earlier claim without new proof.

#### Section shapes

Use only four recurring section structures:

1. `Editorial intro`: centred or left-aligned heading, short supporting copy, optional CTA.
2. `Product stage`: one large product visual with a compact caption/proof strip.
3. `Split proof`: copy on one side, real product state on the other.
4. `Comparison row`: concise label/value rows for pricing, trust, providers, or platforms.

Avoid alternating between dozens of unrelated bento-card arrangements. Bento may be used once for the desktop workspace modes only if every tile contains real product media.

### 10.7 Typography system

- Use one contemporary grotesk/sans family for product marketing and one restrained monospace for terminal paths, commands, model names, and status details.
- Prefer a licensed/self-hosted variable font or a system-safe stack with minimal layout shift.
- Display headline: `clamp(3rem, 6.2vw, 6.5rem)`, tight but not touching, maximum about 11 words over two to three lines.
- Section headline: `clamp(2.2rem, 4vw, 4.25rem)`.
- Feature headline: `clamp(1.5rem, 2.3vw, 2.5rem)`.
- Body lead: `18px` to `22px`, line height `1.45` to `1.55`.
- Body: `16px` to `18px`, line height `1.55` to `1.7`.
- Metadata: `12px` to `14px`, never so dim that it fails contrast.
- Avoid all-caps paragraphs. Reserve uppercase/letter-spaced type for short eyebrow labels only.
- Do not use gradient-filled body text. A restrained gradient may touch one word in the hero only if plain text remains fully readable.

### 10.8 Surface, colour, and lighting specification

Core marketing tokens should derive from the product:

- `--canvas: #0D0D0F`
- `--canvas-raised: #121214`
- `--surface: #19191D`
- `--surface-elevated: #222226`
- `--rail: #17171B`
- `--line: rgba(255,255,255,0.09)`
- `--line-strong: rgba(255,255,255,0.16)`
- `--text: #F7F7F8`
- `--text-muted: #A4A4AD`
- `--violet: #7B2CFF`
- `--pink: #FF35C8`
- `--amber: #FFB84D`

Rules:

- Keep approximately 85–90% of the page neutral graphite.
- Use violet for primary actions, focus, active workflow state, and connection identity.
- Use pink and amber mainly in the canonical V mark and short signal transitions.
- Let product screenshots retain their authentic provider/status colours inside the frame.
- Use one restrained radial atmosphere behind the hero product stage. It must fade before reaching body copy.
- Use borders and tonal separation before shadows.
- Product frames may use a narrow shadow plus a soft local atmosphere; ordinary content rows should remain flat.
- No frosted-glass wall of cards. If blur is used in the marketing navigation, keep it bounded, optional, and performance-tested.

### 10.9 Navigation design

Desktop:

- 64px to 72px high.
- Logo left, four or five quiet navigation items centred/left, platform-aware CTA right.
- Transparent over hero at top; on scroll it may become a compact graphite surface with one hairline divider.
- Hide the Resources mega-menu until requested. Keep it keyboard-accessible and modest in width.
- CTA label should name the real next step: `Join beta`, `Download for Windows`, or `Get Vibyra`.

Phone:

- Logo, one primary CTA, and menu button.
- Menu opens as a full-width sheet below the header, not a tiny floating desktop menu.
- Keep download platform choices inside the sheet if automatic detection is uncertain.
- Prevent the mobile menu and sticky CTA from competing for the same lower viewport area.

Motion:

- Header enters with the page; it does not repeatedly animate on every small scroll change.
- Scrolled state uses a `160–220ms` opacity/border transition.
- Never shrink/expand the navigation continuously with scroll.

### 10.10 Hero composition

#### Desktop hero

Use a two-part first viewport:

1. Copy block across approximately five grid columns.
2. Cross-device product stage across seven columns, allowed to extend slightly beyond the main grid on large screens.

Copy block order:

- Eyebrow.
- Headline.
- Two-line subhead.
- Primary CTA and quiet watch-demo action.
- One truth/requirement line.

Product stage:

- Desktop frame is the visual anchor, shown at a slight but readable perspective of no more than `2deg` to `3deg`; zero perspective is preferred if text clarity suffers.
- Phone overlaps the desktop lower-left or lower-right edge without covering the terminal work or preview result.
- Connection signal runs in the negative space between them.
- The first static frame already communicates phone prompt + desktop work. The visitor must not need motion to understand it.
- Do not make the phone float in empty space with no clear relationship to desktop.

#### Phone hero

- Stack copy above the product stage.
- Show the phone at near-full width and crop the desktop behind it as a contextual second layer.
- Provide a clear `Play workflow` button; do not autoplay a complex sequence immediately on mobile.
- Keep the primary CTA visible before the product stage ends, but avoid a permanently sticky hero CTA.

#### Hero interaction

Recommended control: a single play/pause button plus a labelled four-step progress rail:

`Send → Run → Review → Preview`

- Clicking a step jumps to that real state.
- Autoplay starts only when the stage is substantially visible, data-saver is not active, and reduced motion is not requested.
- The sequence pauses when the tab is hidden or the stage leaves the viewport.
- It stops after one complete cycle and settles on the final preview instead of looping forever.
- The full workflow must have captions and an adjacent text summary.

### 10.11 Homepage scroll choreography

The page should feel continuous without becoming scroll-jacked.

#### Chapter 0: Hero

- Copy appears first.
- Desktop frame settles upward by `16px`; phone settles upward by `24px` with a `60–100ms` stagger.
- Connection signal draws once after both frames are stable.
- CTA is usable immediately; entrance motion must never delay interaction.

#### Chapter 1: Connect

- Use a split section with a pairing state on desktop and confirmation state on phone.
- As the section enters, the static connection path brightens once from desktop to phone.
- On completion, both frames show the connected state and a short one-shot edge confirmation.
- Copy: same account, two-sided approval, clear setup expectation.

#### Chapter 2: Direct

- Use a wide product stage showing a phone prompt and desktop terminal/project context.
- Prompt text should appear as a completed line or short type-on effect lasting no more than `500ms`; do not simulate slow human typing.
- A travelling signal reaches the desktop, then the terminal shows real bounded output.
- Keep terminal text readable and authentic; do not animate hundreds of fake lines.

#### Chapter 3: Review

- Desktop and phone frames shift into a balanced 50/50 split.
- Changed-files and permission states reveal with simple opacity/translate transitions.
- The Apply action receives focus styling only after the evidence is visible.
- Success uses a short border/edge confirmation, not confetti.

#### Chapter 4: Preview

- The preview result expands from inside the desktop workspace to become the visual focus.
- Phone shows the same result in its real preview surface.
- Use one shared-element-style scale transition only if it can be implemented without layout shift or motion discomfort.
- Reduced motion swaps the content instantly with a short dissolve.

#### Chapter 5: Desktop depth

- Optional horizontal mode selector: `Editor`, `Preview`, `AI`, `Memory`.
- User controls the state; do not auto-cycle while they are reading.
- Each state uses the same mounted frame and crossfades only the internal product capture.

#### Chapter 6: Trust

- Motion nearly stops.
- Use a static architecture/data-flow diagram with hover/focus disclosure.
- This quieter section creates contrast and signals seriousness.

#### Chapter 7: Pricing and CTA

- No elaborate entrance.
- Pricing rows rise/fade once in a short stagger of no more than `40ms` between plans.
- The selected billing period updates numbers without flipping or counting animations.
- Final CTA repeats the one real launch action.

### 10.12 Motion design system

Motion principles:

1. Motion explains cause and effect.
2. Motion never invents product progress.
3. Motion stops once the information is understood.
4. Interaction response is faster than storytelling motion.
5. Layout remains stable; animate within reserved bounds.

#### Duration tokens

- `--motion-instant: 80ms` — pressed states and tiny icon response.
- `--motion-fast: 140ms` — hover, focus-supporting colour, small menu response.
- `--motion-standard: 220ms` — reveal, tab content, nav state.
- `--motion-emphasis: 360ms` — product-frame entrance or meaningful state change.
- `--motion-story: 600ms` — connection-path travel/shared product transition.
- Do not exceed `800ms` for a single transition except controlled video/demo playback.

#### Easing tokens

- Standard entrance: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Standard exit: `cubic-bezier(0.4, 0, 1, 1)`.
- Symmetric state change: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Avoid exaggerated elastic/bounce easing for product frames, pricing, trust, or navigation.
- A very small spring may be used for the play button or phone confirmation only when it settles in under `400ms` and has no overshoot under reduced motion.

#### Allowed animated properties

- Prefer `transform` and `opacity` for compositor-friendly motion.
- Animate path drawing with stroke techniques only for the bounded connection signal.
- Avoid animating width, height, top, left, grid tracks, blur radius, large shadows, or background filters during scrolling.
- Never animate text metrics, terminal row geometry, screenshot aspect ratio, or reserved media height.

#### Scroll triggers

- Use Intersection Observer or equivalent visibility state, not continuous document-wide scroll handlers.
- Trigger ordinary section reveals once per page view.
- Start product storytelling only around 60% visibility and stop below about 20% visibility.
- Do not pin more than one section, and preferably avoid pinning entirely on phone/tablet.
- Never hijack wheel/touch input, snap the whole document, or map vertical scrolling to a long horizontal carousel.

### 10.13 Microinteraction specification

Buttons:

- Hover: `translateY(-1px)` maximum plus border/surface change.
- Press: return to `translateY(0)` with a slight `scale(0.99)` if it remains crisp.
- Focus: visible 2px semantic ring with offset; focus must not rely on glow alone.
- Loading: keep label width stable and show a small indicator plus honest state copy.

Links:

- Text colour and underline/arrow shift are sufficient.
- Arrow movement no more than `3px`.
- External destinations must remain understandable without animated icons.

Product frames:

- Hover may raise the frame `2px` to `4px` only when the frame is interactive.
- Static screenshots must not pretend to be clickable.
- Interactive demonstrations require visible controls, keyboard operation, and a reset action.

Provider/platform badges:

- No marquee by default.
- Use a static, wrapping row of verified providers/platforms.
- If overflow needs motion on narrow screens, use a user-controlled horizontal scroller with no automatic movement.

Pricing:

- Monthly/annual selector uses a compact sliding indicator with a reduced-motion crossfade fallback.
- Prices update immediately; no slot-machine numeral animation.
- Recommended plan may receive a thin violet edge and a small badge, not a looping glow.

### 10.14 Responsive visual behaviour

At `>= 1200px`:

- Full asymmetric hero, overlapping phone/desktop stage, complete navigation.
- Product chapters may alternate copy and visual alignment, but the underlying grid remains stable.

At `768px–1199px`:

- Reduce or remove device overlap.
- Stack hero copy above a centred product stage.
- Convert dense desktop product frames into cropped, labelled focus regions rather than shrinking unreadable UI.
- Avoid pinned/scrollytelling sections.

Below `768px`:

- One-column flow.
- Phone becomes the primary frame; desktop is contextual and may appear in the following panel.
- Replace hover explanations with tap disclosures.
- Replace wide comparison tables with grouped rows/cards that preserve label-value relationships.
- Product mode selectors become horizontally scrollable tabs with visible active state.
- Do not hide essential proof solely because the full desktop screenshot cannot fit; provide focused crops and accessible captions.

Below `400px`:

- Protect CTA labels from wrapping.
- Remove decorative perspective and overlap.
- Use poster-first demo media.
- Preserve at least `44px` interaction targets.

### 10.15 Reduced-motion and animation control

- Honour `@media (prefers-reduced-motion: reduce)` everywhere.
- Under reduced motion, remove parallax, device travel, path travel, shared-element scaling, auto-cycling, and large transforms.
- Replace motion with static end states, short opacity dissolves, active borders, and explicit labels.
- Any automatic motion lasting more than five seconds or running beside readable content requires a visible pause/stop mechanism.
- Hero workflow playback needs play/pause, step navigation, and a static poster.
- Preserve content order and meaning when animation is disabled.
- Do not use flashing above accessibility thresholds; avoid blinking status entirely.
- Pause media/animation when `document.visibilityState` is hidden.

### 10.16 Frontend implementation guidance for a future build

No implementation is authorized in the current task. When implementation begins:

- Start with semantic HTML and CSS transitions/animations.
- Use a small motion abstraction only for the hero workflow and shared product states; do not adopt a large animation library for simple fades.
- Lazy-load non-critical motion code and demo media.
- Use responsive images (`srcset`, modern formats, explicit dimensions) and poster frames.
- Prefer recorded video/WebM for complex real terminal/UI activity when recreating it in DOM would be fragile or misleading.
- Prefer DOM/SVG for the connection signal, step rail, play controls, and simple state transitions.
- Avoid WebGL/canvas for the main narrative unless measurement proves it materially improves the experience and remains accessible.
- Keep animation state isolated from pricing, auth, download, and release-status business logic.
- Define a typed motion/content storyboard so every animated state maps to a verified screenshot/video frame and claim.
- Add a manual `?motion=reduce` or development override for QA without depending on OS settings.

### 10.17 Animation performance budgets

- Maintain 60fps on representative mid-range hardware for ordinary transitions.
- Zero unexpected layout shifts from animation.
- No long task over `50ms` caused by marketing animation during initial interaction.
- Hero poster and CTA render without waiting for animation JavaScript.
- Do not preload every video state; preload only the poster and first required segment.
- Stop observers, timers, and requestAnimationFrame loops when sections are inactive.
- Test CPU-throttled and low-power/data-saver scenarios.
- Animate primarily with transform/opacity, following browser performance guidance.
- Treat the existing `170KB gzip` initial JavaScript goal as a total page budget, not an animation-library budget.

### 10.18 Visual and motion anti-patterns

- No generic animated AI sphere.
- No particles following the pointer.
- No infinite logo carousel.
- No fake terminal typing that claims work is happening.
- No scroll-jacking or mandatory horizontal-scroll chapter.
- No full-page parallax layers moving at different speeds.
- No 3D device rotation that makes product text unreadable.
- No section where every card floats independently.
- No glowing border looping around pricing plans.
- No animated counters without verified metrics.
- No cursor-replacement effect.
- No autoplay audio.
- No animation that delays navigation, CTA activation, form submission, pricing updates, or download.
- No copying another SaaS's signature keyboard, grid, colour, typography, or device composition closely enough to weaken Vibyra's identity.

### 10.19 Frontend design acceptance criteria

The future design is ready to implement only when:

- A silent five-second view communicates phone + desktop + active AI work.
- A silent 15-second workflow communicates Send, Run, Review, and Preview.
- The hero remains understandable as a static screenshot.
- Every homepage section adds new evidence rather than a repeated claim.
- All product media comes from a release-verified Vibyra build.
- Text in product frames remains legible at its intended breakpoint or is replaced with a deliberate crop.
- Primary CTA is visually dominant and release-state correct.
- The whole page works with JavaScript unavailable except interactive enhancements.
- Keyboard and screen-reader users can operate the demo controls and reach equivalent information.
- Reduced-motion mode preserves the full story without large movement.
- No continuous animation runs without a user control when accessibility rules require one.
- Core Web Vitals and JavaScript budgets remain within Section 12.3 targets.
- Visual QA covers real phone, tablet, laptop, desktop, light/dark OS settings, high contrast, 200% zoom, and reduced motion.
- A side-by-side audit shows influence from the reference set at the pattern level without copying any one site's visual identity.

## 11. Content Production Plan

### 11.1 Core demo scenario

Use one coherent demo project throughout the site. Recommended scenario:

> A real small web or Expo app has a broken checkout/layout. The user sends a fix from the phone, Vibyra Desktop runs the supported agent, the user reviews changes, opens the preview, and continues with a follow-up.

The scenario must be deterministic, visually obvious, safe to publish, and finish in under 90 seconds.

### 11.2 Copy deliverables

- Message house and claim register.
- Homepage copy deck.
- Product/desktop/mobile page copy.
- Pricing explanations and FAQs.
- Security copy reviewed by engineering/legal.
- Download/install copy per platform.
- Four evidence-based comparison pages.
- Metadata, Open Graph text, image alt text, and structured-data fields.
- Store listing consistency checklist.

### 11.3 Proof backlog

Before launch gather real:

- Beta-user quotes with written permission and role/company display choice.
- Product usage outcomes, with definitions and sample size.
- Reliability measures for pairing and preview startup.
- Supported platform/provider test matrix.
- Short customer workflow clips.
- Security review results that can be stated publicly.

Until proof exists, omit the social-proof section rather than filling it with logos or vague statements.

## 12. Technical Architecture Plan

### 12.1 Route separation

Recommended architecture:

- Canonical marketing host: decide between `vibyra.app` and `vibyra.ai`.
- Public marketing routes served separately from authenticated desktop routes and APIs.
- Keep `/api/*`, desktop bridge routes, OAuth callbacks, reset links, hosted demos, and well-known association files stable.
- Do not let the public `/` route depend on `desktop.legacy_routes_enabled`.
- Move any legacy desktop browser surface behind an explicit `/desktop` or local-only host if still required.

### 12.2 Rendering and content

- Prefer server-rendered/static-first pages for fast first render and crawlability.
- Reuse the existing Laravel/Vite deployment only if it can cleanly isolate marketing components, CSS, routes, and cache policy.
- Avoid introducing a CMS until more than one non-engineer must publish frequently.
- Initial content can be typed files with shared schemas for plans, platforms, providers, claims, FAQs, comparisons, and release status.
- Use the backend plans API/shared config for pricing.
- Add a small release-status manifest for CTA selection and verified provider/platform badges.

### 12.3 Performance budgets

Targets for production mobile on a representative mid-range device/network:

- LCP ≤ 2.5s at the 75th percentile.
- INP ≤ 200ms at the 75th percentile.
- CLS ≤ 0.1.
- Initial JavaScript ≤ 170KB gzip unless measurement justifies more.
- Homepage media must use poster images, responsive sources, lazy loading, and explicit dimensions.
- No autoplay video download before it approaches the viewport; respect data saver and reduced motion.

### 12.4 Accessibility

- WCAG 2.2 AA target.
- Full keyboard path, visible focus, skip link, semantic landmarks, correct heading order.
- Captions and transcript for every demo.
- Product screenshots require useful alt text or adjacent explanations.
- Minimum contrast in gradients, muted text, pricing, and disabled states.
- No information conveyed only by purple, green, motion, or status dots.
- Reduced-motion version of cross-device animations.
- Test at 200% zoom, narrow mobile widths, and screen-reader landmarks/forms.

### 12.5 SEO and discoverability

Topic clusters:

- AI coding from phone while projects run locally.
- Remote control for local AI coding agents.
- Multi-agent coding workspace.
- Mobile review and live preview for AI-generated code.
- Cursor Mobile alternatives/comparisons.
- Claude Code Remote Control and Happy alternatives/comparisons.
- Replit mobile vs local-project workflows.

Requirements:

- Unique title/description/canonical per page.
- XML sitemap and intentional robots rules.
- Product, SoftwareApplication, FAQ, Breadcrumb, Article, and Video structured data only where content qualifies.
- Open Graph/video cards built from real product assets.
- Clean redirects for host and path changes.
- Do not index authenticated flows, callback/status URLs, preview capabilities, or internal desktop routes.

## 13. Legal, Privacy, And Trust Dependencies

Before public launch:

- Confirm the legal entity, contact details, governing law, refund terms, and consumer cancellation rights.
- Finalize privacy policy covering phone, desktop, backend, AI providers, analytics, crash reporting, voice/transcription, prompt transcripts, project memory, publishing, and account deletion.
- Publish a subprocessor list and data-retention schedule.
- Confirm cookie/consent behavior for target regions.
- Review provider trademark/logo usage.
- Add vulnerability disclosure and security contact.
- Verify that pricing, VAT, renewal, annual totals, and cancellation copy meet UK and store requirements.
- Ensure the website never implies a certification, encryption guarantee, or data residency arrangement that has not been documented.

## 14. Implementation Phases For A Future Build

No phase below should begin under the current request.

### Phase 0: Decisions and evidence

- Choose canonical domain and redirect policy.
- Choose launch mode: waitlist, private beta, or public download.
- Freeze verified platform/provider matrix.
- Reconcile Free concurrent-agent behavior.
- Approve the message house and claim register.
- Complete data-flow/privacy review.
- Select the deterministic demo project.
- Define analytics and consent policy.

Exit gate: every hero, pricing, platform, provider, privacy, and security claim has an owner and evidence.

### Phase 1: Foundation

- Establish public route/application boundary.
- Add design tokens, layout primitives, navigation/footer, metadata, release manifest, claim schema, pricing data adapter, analytics consent, and error handling.
- Implement accessibility and performance budgets in CI.

Exit gate: skeleton pages render server-side, routes do not collide, and platform-aware CTAs cannot produce dead downloads.

### Phase 2: Conversion core

- Build Homepage, How it works, Download, Pricing, Security, Support, Privacy, and Terms.
- Produce the hero proof loop and one full workflow video.
- Add waitlist/download funnel and lifecycle emails.

Exit gate: a new visitor can understand, trust, and start the correct install/beta path without support.

### Phase 3: Product depth

- Build Desktop, Mobile, Product, feature pages, getting-started docs, provider/platform matrices, and richer FAQ.
- Add product-version metadata to media assets.

Exit gate: every marketed workflow links to setup details and release evidence.

### Phase 4: Acquisition

- Launch comparison hub and initial comparison pages.
- Add guides/blog only with an editorial owner and cadence.
- Add changelog/status/community links.
- Create campaign landing pages from the same verified content model.

Exit gate: comparison pages are dated, sourced, fair, and monitored for staleness.

### Phase 5: Optimization

- Analyze funnel by platform and acquisition source.
- Test headline/demo/CTA variants one variable at a time.
- Improve unsupported-platform capture and activation handoff.
- Add social proof only after evidence is strong.

Exit gate: changes are based on qualified activation, not only click-through rate.

## 15. Workstreams And Ownership

- Product/Founder: category, launch state, audience, priorities, roadmap boundaries.
- Engineering: product truth, platform/provider matrix, route architecture, pricing adapter, downloads, security evidence.
- Design: site system, demo storyboard, capture fixtures, responsive/accessibility states.
- Content/Growth: copy deck, comparisons, SEO, launch campaigns, lifecycle emails.
- Legal/Privacy: policies, consent, pricing/renewal language, subprocessors, claims.
- Support/Operations: install troubleshooting, status page, support workflows, incident messaging.
- Analytics: event dictionary, dashboards, experiment rules, retention and access.

Every page needs one durable owner and review date.

## 16. Validation Matrix

### Product truth

- Each feature statement maps to a release test, source owner, and platform/provider condition.
- All screenshots/video come from the advertised release.
- Local/cloud diagram matches actual network behavior.
- Prices and limits match the live plans endpoint.

### Functional

- Navigation, forms, download URLs, store links, mail links, legal links, OAuth/reset associations, and redirects.
- Waitlist deduplication, confirmation, consent capture, abuse protection, and unsubscribe.
- Platform detection never blocks manual platform choice.

### Responsive

- 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080.
- Long headlines, localized copy, pricing tables, menus, demos, and comparison tables.

### Browser/device

- Current and previous Safari/Chrome/Edge/Firefox.
- Real iPhone and Android hardware for media, forms, sticky CTAs, and download handoff.
- Windows and Linux desktop download/setup handoff; macOS only when verified.

### Quality

- Automated accessibility and manual keyboard/screen-reader pass.
- Lighthouse/WebPageTest plus real-user Core Web Vitals.
- Broken-link, metadata, sitemap, robots, structured-data, and visual-regression checks.
- Security headers, CSP, form rate limits, dependency checks, and secret scanning.
- Analytics event validation without personal project/path/prompt leakage.

## 17. Launch Checklist

- Canonical host, SSL, redirects, DNS, and uptime monitoring.
- Production downloads signed, checksummed where appropriate, versioned, and rollback-ready.
- Store listings live or correctly labelled beta.
- Pricing and purchase/cancellation paths verified end to end.
- Privacy, terms, support, security, status, and vulnerability contact live.
- Demo video, poster, captions, transcript, and reduced-motion fallback live.
- SEO metadata, sitemap, robots, structured data, and social cards verified.
- Analytics consent and event dashboard verified.
- Support runbook for pairing, same-account errors, desktop reachability, provider setup, preview startup, and billing.
- No fake sample data, unsupported provider logos, dead CTAs, or roadmap features in present tense.
- Rollback plan for site, pricing feed, forms, and downloads.

## 18. Success Metrics

North-star marketing metric:

> Qualified activation: a new account successfully connects a phone and desktop, opens a real project, and completes a first approved workflow.

Supporting metrics:

- Visitor → qualified signup/waitlist.
- Signup → desktop download.
- Download → desktop first launch.
- First launch → same-account pairing success.
- Pairing → first project open.
- First project → first task.
- First task → first approved edit or successful preview.
- Time to qualified activation.
- Activation by OS, phone platform, acquisition source, and plan.
- Pairing, install, preview, and provider-setup failure rates.
- Week-1 return and paid conversion after activation.

Avoid optimizing for raw traffic, video plays, or download counts without activation.

## 19. Decisions Required Before Implementation

1. Is the canonical brand domain `vibyra.app`, `vibyra.ai`, or another host?
2. Is the launch CTA waitlist, private beta, account signup, or direct download?
3. Which phone platforms are actually store-available on launch day?
4. Which desktop operating systems have signed, supported installers?
5. Which AI providers/runtimes are public, beta, or internal?
6. Does the Free plan permit one terminal/agent, and how is that reconciled with backend configuration?
7. Which local/cloud sentence has passed technical and legal review?
8. Is public Explore populated enough to market, or should it remain in-product only at launch?
9. Is project publishing a launch pillar or secondary feature?
10. Who owns support, status, security disclosure, and comparison freshness?
11. Is the desktop bridge intended to be open source? Older strategy proposed it; the current repository decision is not established.
12. Which analytics provider and consent model are acceptable?

## 20. Deliberate Non-Goals For Version One

- No giant feature matrix on the homepage.
- No generic Home/dashboard recreation.
- No fake live terminal embedded in the browser.
- No interactive cloud IDE demo requiring access to visitor code.
- No public roadmap without an owner.
- No dozens of SEO pages before the core conversion path works.
- No user-generated community feed on the homepage until moderation and content quality are dependable.
- No enterprise page until enterprise sales, security, support, and contracts exist.
- No localization until the English message and funnel are stable; architect for localization from day one.

## 21. Recommended Final Site Story In One Sentence

> Vibyra connects your phone to a serious AI coding workspace on your computer, so you can keep real projects moving, review what changes, and see the result wherever you are.

## 22. Source Anchors

Repository anchors reviewed for this plan:

- `README.md`
- `App.tsx`
- `app.json`
- `src/screens/AuthScreen.tsx`
- `src/screens/OnboardingScreen.tsx`
- `src/screens/WorkspaceScreen.tsx`
- `src/screens/welcome/`
- `src/screens/workspace/inline/`
- `src/context/`
- `src/utils/chatSkills.ts`
- `desktop/app.html`
- `desktop/assets/`
- `desktop/lib/`
- `backend/routes/web.php`
- `backend/config/billing.php`
- `backend/app/Http/Controllers/BillingController.php`
- `backend/resources/js/app.jsx`
- `Vibyra/_ai/Marketing/Competitor Marketing Analysis.md`

Current external market anchors:

- Cursor Mobile: https://cursor.com/mobile
- Cursor Web & Mobile docs: https://docs.cursor.com/en/background-agent/web-and-mobile
- Happy Coder: https://happy.engineering/
- Happy Coder docs: https://happy.engineering/docs/
- Replit Mobile: https://replit.com/products/mobile
- Replit mobile docs: https://docs.replit.com/references/platforms/mobile-app

Frontend layout and motion research anchors:

- Linear: https://linear.app/
- Cursor: https://cursor.com/
- Raycast: https://www.raycast.com/
- Vercel: https://vercel.com/
- Warp: https://www.warp.dev/
- Replit: https://replit.com/
- Lovable: https://lovable.dev/
- Bolt: https://bolt.new/
- MDN reduced motion: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
- W3C Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- web.dev animation performance: https://web.dev/articles/animations-and-performance
