# Owner dashboard: complete frontend revamp

Status: frontend implementation completed and locally verified, 12 October 2026. Production release remains pending independent review. See `docs/owner-dashboard-implementation-20261012.md` in the review branch for validation and preview instructions.

## Outcome

Give Ellis a dashboard that answers, within a few seconds: are people joining, downloading Vibyra and taking up Pro; where is activity coming from; and is there anything that needs a closer look?

Redesign the complete owner experience: navigation, page hierarchy, copy, cards, charts, tables, forms, loading and error states, responsive layouts, and owner sign-in/verification presentation. Use the existing backend and preserve the meaning of its data.

## Review completed

Inspected the authenticated live dashboard at `https://vibyra.net/owner`: Overview, Website, Desktop, Mobile, Accounts, Commercial, Data quality, and Licenses. Read the full accessible page content and inspected the rendered desktop layout for each section. Inspected the empty license list and opened/closed its creation form without submitting. Accounts was accessible in the existing owner session. No account, payment, license, consent or access setting was changed.

Read selected deployed frontend and reporting source to confirm date options, account pagination, polling, chart behavior, membership scope and checkout counts. Live source includes sections missing from one or other development checkout: main and `Vibyra-web` are not individually a complete representation of production.

Not exercised live: mobile layouts, sign-out/sign-in, expired owner verification, populated license rows, license creation/revocation or failed network responses. These are explicit design and validation cases below, not claims of current defects. Raw customer records are intentionally excluded from this document.

## What needs to change

| Current area | Observed problem | Redesign decision |
| --- | --- | --- |
| Shared shell | Huge titles, multiple branding/header layers, numbered navigation and external-link arrows for internal tabs. Too much space before useful content. | One compact page heading and toolbar; plain navigation labels; meaningful icons only. |
| Overview | Cloud AI users/turns occupy headline positions. Downloads and confirmed checkouts are absent from the headline row. Many sections repeat detail pages. | Lead with registrations, downloads, website checkouts and current Pro accounts; limit the initial view to the essential summary. |
| Website | Traffic, downloads, attribution, funnels, geography, performance and purchases form one long page. Purchases are buried deep below discovery charts. | Move downloads and memberships to their own destinations. Divide Website into focused tabs. |
| Desktop | Six equally prominent metrics, technical event names and several sparse breakdowns. | A concise usage summary with detailed actions below it; no raw engagement heartbeat counts in the default view. |
| Mobile | Similar duplication; collected sessions can be mistaken for people; low-volume chart axes repeat rounded labels. | Match Desktop's layout, define the unit visibly, use sensible integer ticks and useful empty states. |
| Accounts | Seven columns, long guest-generated email identifiers, repeated heading, no search in the live UI, and irrelevant report period controls. | A readable user directory with concise columns and a details panel; keep pagination explicit. |
| Commercial | Mostly accounts and AI model usage. Current Pro status is mixed with cost information and does not establish paid subscriptions. | Rename to Memberships. Move AI costs/model usage into App usage → Cloud AI. |
| Data quality | Technical settings and lengthy explanations dominate. A source says “Collecting” even when the last receipt was days ago. | A compact Tracking status page, clear receipt timestamps and expandable technical detail. Avoid inferring an outage from inactivity. |
| Licenses | Duplicate title, oversized form/list containers and jargon around validity/allowance. Empty table keeps redundant pagination. | Memberships → Licenses, a compact list, clear empty state and a focused creation panel with an explicit review step. |

Cross-page confusion also needs fixing. New registrations across Vibyra and signups recorded by the website are different measures. Current membership state and selected-period activity use different time scopes. Total download responses and consented download-funnel completions use different populations. These distinctions belong beside the figures; the owner should not have to find them in a long footer.

## New navigation

Six primary destinations:

1. **Overview** — the business at a glance.
2. **Users** — registered accounts and account details.
3. **Downloads** — download responses and platforms.
4. **Memberships** — current plans, recorded website checkouts and licenses.
5. **Website** — visits, sources and visitor journeys.
6. **App usage** — Desktop, Mobile and Cloud AI tabs.

At the bottom: **Tracking status**, account menu and **Back to Vibyra**.

Memberships contains **Summary** and **Licenses** tabs. Website contains **Traffic**, **Sources**, **Journeys** and **Experience**. This retains all existing information while reducing the amount visible at once.

Use URL-backed frontend navigation such as `/owner?view=downloads&days=30`. Reload and browser Back should preserve the chosen page and period without requiring new server routes. Never put customer information or license keys in URLs.

## Overview layout

The first desktop viewport should contain the heading, four business figures, and the beginning of a useful trend. A proposed wireframe:

```text
Sidebar     Overview                Last 30 days ▾    Updated … ↻
            13 Sep–12 Oct · UTC

            New registrations | Downloads | Website checkouts | Pro accounts
            In selected period  In period   Recorded in period  Current total

            Download activity                  Current accounts
            Daily chart + exact values         Registered / guest
            View downloads                     Free / Pro

            App activity summary               Tracking notes
            Desktop / Mobile / Cloud AI        Only relevant, factual notices
```

Each figure has a clear label, value, time scope, brief definition and a link to its detail page. Labels must use the data contract below. Show a dash with an explanation for missing data, never a fabricated zero.

The graph initially uses the existing daily download series. Confirm its coverage against the headline total before connecting the two; show coverage differences explicitly if necessary. Do not invent an all-platform registration trend from website-only signup events.

The account summary separates registered accounts from guests. Technical cloud activity moves below the business figures. Notices can say “Mobile: last activity received 8 days ago” or “2 cloud AI requests failed in this period” when supported; they must not imply a broken collector or ongoing incident without evidence.

A universal, timestamped signup/download/purchase feed is not part of this frontend-only scope. The existing aggregate endpoint cannot supply it. A latest-account list can appear inside Users using the already protected account endpoint; it must not pull named records into an unverified overview session.

## Page-by-page design

### Users

- Primary table columns: Account, Plan, Verification, Joined and Last recorded use. Keep full dates and the distinction between login and token use in an expandable detail panel.
- Show readable plan and verification badges. A guest should have a short guest label where it can be identified reliably; the technical address belongs in details. If the payload cannot classify a row reliably, preserve its literal state instead of guessing.
- Remove the global analytics date selector from this directory. Its current endpoint pages the full account list and its login count is explicitly a fixed 30-day measure.
- Retain newest-first order and 25-row server pagination. Show “Showing 1–25 of …”. No empty previous/next controls for a single page.
- The deployed endpoint accepts `page` only. Do not add a global-looking search box that searches only the visible 25 rows, or download all accounts just to simulate search. Global name/email search, plan filtering and arbitrary sorting are a clearly separated future API enhancement. If a local filter is useful during implementation, label it “Filter this page” and state the scope.
- Design readable loading, no records, page failure, owner verification required, verification expired and access denied states. Preserve the current second-factor gate.

### Downloads

- Lead with total recorded download responses for the period, then one daily trend and a compact platform table.
- Platform rows: macOS Apple Silicon, macOS Intel, Windows, Linux AppImage and Linux Debian, following the returned dimensions.
- Show count and share only when the denominator is valid and coverage matches. Keep unknown/other categories visible rather than silently dropping them.
- Explain once, beside the headline, “Download responses; installations aren't measured.” Put update/repeat-request coverage in a details disclosure.
- Keep download button clicks and consented funnel completions in Website → Journeys, with a direct link from Downloads. Avoid placing unlike totals together as if they are a single conversion funnel.

### Memberships

- Show Free accounts, Pro accounts and recorded website checkouts as distinct measures. Current plan counts are always labelled “Current”; the checkout count uses the selected period.
- Bring the existing `verified_purchases` value here and to Overview. Its current UI calls it completed Stripe checkouts; the deployed report counts recorded `website_purchase` events. Preserve this limited meaning until coverage is verified. Do not rename it “New Pro subscriptions”.
- Use a simple plan distribution with actual counts. A Pro account can be paid, granted, trial-based or historical; show provenance only if an existing returned field establishes it.
- Revenue, MRR, refunds, profit, churn and individual payment history are not returned by this report. Omit those cards from the default layout; explain the limitation in a small reporting-details panel.
- Put license management in the second tab. Keep payment counts distinct from complimentary licenses.

### Licenses within Memberships

- One heading, one Create license button, existing server-supported search, compact status rows and a meaningful “No licenses yet” state.
- In the creation panel, group fields into: label, Pro duration, token allowance and redemption deadline. Use “Tokens each month” versus “One-time tokens”; explain “Redeem by” separately from “Pro ends”.
- Include a continuously readable summary of what the recipient will receive. Retain Review → Create and the exact existing payload and rules.
- Keep beta welcome as an explicit labelled choice. Preserve the one-time key reveal/copy behavior and the existing revoke confirmation; never store keys in local storage or put them in analytics.
- Design available, redeemed, expired and revoked rows from actual API states. Handle verification expiry and uncertain submission outcomes without duplicate creation.

### Website

- **Traffic:** recorded browser sessions, page views, recent engagement and a daily trend. Say “Tracked visits” only with the definition “Browser sessions with analytics enabled”; do not call them unique people.
- **Sources:** channels, referring sites and campaigns, followed by landing pages. Consolidate sparse breakdowns into concise tables instead of a grid of mostly empty cards.
- **Journeys:** website signups, waitlist and download actions. Show consented funnels together, with the eligible session count in the heading. Explain how these differ from the all-response download count and registrations across Vibyra.
- **Experience:** load/interaction measurements, sample counts, captured browser errors, devices and browser breakdowns. Country/region groups remain suppressed when the backend suppresses them.
- Translate raw route/CTA/location identifiers into plain names where mappings are reliable; keep the raw identifier available as secondary detail. Never guess a campaign source.

### App usage

- Use the same layout for Desktop and Mobile: recorded sessions, launches and engaged time, followed by a trend and a compact feature-use table.
- Put provider/model breakdowns in an expandable detail area. Move engagement-interval heartbeat counts into technical details.
- Keep the existing mixed account/session counting definition visible. Do not sum Desktop and Mobile into a “unique users” total or label five-minute engagement as “Online now”.
- Cloud AI gets its own tab for requests, completed/failed requests, distinct accounts, model breakdown and recorded provider cost in USD. Use friendly model names with the provider shown separately.
- Show very small positive costs as “< $0.01” rather than rounding them to zero; keep currency explicit and do not infer profit or total company spend.

### Tracking status and help

- Replace large metric cards with one table: source, availability, last received activity and coverage note. Report fetch time and last event time are separate.
- Surface actionable failures that the response establishes. Historical activity alone must not produce a green “Everything healthy” badge.
- Expandable details contain retention, consent choices, accepted/rejected/blocked event counts, geography availability and metric definitions.
- Replace the repeated wall of footer text with a short page-specific coverage sentence and a “How these figures are counted” disclosure/link. Important qualifications stay beside the relevant number.

### Owner access screens

- Extend the same type, spacing, field, button and message system to owner login, authenticator setup and verification states.
- Use a short “Verify to view account details” explanation with a clear next step and return the owner to the page they were opening.
- Preserve authentication, CSRF, access checks, second-factor timing and all existing submission behavior. Audit these screens in fixtures instead of changing the live owner's credentials/session for design review.

## Visual and interaction system

Use a calm Vibyra Graphite + Cobalt design. Prepare the light version first for table/chart readability, with an equivalent dark version and the existing theme preference where available. This is a proposed design direction, not a new brand palette.

- A roughly 216–232px sidebar; a compact 56–64px toolbar; 24–32px page padding; a comfortable maximum reading width on large displays.
- Page titles around 28px, card values around 28–36px, body text 14–16px. One title per page, sentence case, no repeated uppercase category labels.
- Neutral backgrounds, subtle borders and restrained cobalt for selection/actions. No large gradients, glows or decorative highlighted statistic cards.
- Four compact headline cards maximum on Overview. Use tables and simple rows for details; avoid nested cards and equal emphasis on every number.
- Charts with clear units, appropriate integer ticks, date labels, keyboard/touch-accessible exact values and a table alternative. Single-point and zero-only series must remain legible; unknown days must not be drawn as zero.
- One consistent date control showing “Last 7 days”, “Last 30 days”, “Last 90 days”, plus the actual date range and UTC basis. Default to 30 days initially. The current API only supports these periods; do not ship decorative Today/custom-date controls.
- Fixed-scope measures have their own labels: “Current”, “Last 24 hours”, “Last 30 days”. Distinct-session and distinct-user totals cannot be summed from daily rows.
- Omit percentage-change badges unless a genuine comparable period is available. Do not extrapolate growth from cumulative totals or a shorter tracking window.
- Background refresh preserves the current layout, scroll position and full content contrast. A small toolbar indicator handles refresh; initial load uses skeletons; failures show last successful update and Retry.
- Distinguish loading, zero activity, unavailable data, suppressed small groups, stale report, lost access and request failure. Use copy that tells the owner what happened and what they can do.
- On narrow screens, replace the sidebar with an accessible menu, stack cards in two/one columns, simplify tables and open details as full-height panels. Preserve primary actions and keep horizontal scrolling inside a labelled table region only where necessary.

## Implementation sequence and checkpoints

1. **Freeze the actual frontend baseline and data map.** Snapshot the currently deployed owner source/assets into an isolated working copy. Inventory every page, interaction, field and API dependency. Record scope/time/coverage for each metric. Deliverable: completeness checklist and field-to-label map. This prevents losing Commercial, Tracking or Licenses when starting from an older checkout.
2. **Design the entire experience.** Create desktop and phone wireframes for every destination, then high-fidelity Overview, Users, Memberships and Downloads screens using one component system. Use clearly labelled synthetic data with empty, sparse and busy variants. Deliverable: a navigable frontend prototype plus the remaining page/state designs, ready for owner review.
3. **Build the shared shell and primitives.** Navigation, URL state, toolbar, theme tokens, metric cards, charts, tables, details panels, status messages and forms. Deliverable: responsive component gallery in light/dark themes.
4. **Implement the daily owner workflow.** Overview → Downloads → Users → Memberships → Licenses, using existing endpoints. Deliverable: core pages fully connected, matching source values and keeping every existing protected action.
5. **Complete the supporting pages.** Website tabs, Desktop/Mobile/Cloud AI, Tracking status and owner access presentation. Deliverable: every current dashboard capability mapped to a redesigned location, with the redundant old layout removed.
6. **Verify the full frontend.** Exercise fixture states and real read-only production data, compare displayed figures with the exact responses, test keyboard/phone layouts and confirm no business/authentication contract changed. Deliverable: screenshots, interaction checks and a concise acceptance record.
7. **Release the reviewed frontend.** Build the exact candidate, preserve the current production backend and unrelated website assets, deploy through the existing release process and check the live owner experience. Retain the previous frontend bundle for rollback. This is a future execution step; this planning task does not deploy it.

## Acceptance criteria

- At 1440×900 and a 1280×800 laptop viewport, the owner can see registrations, downloads, website checkouts and current Pro accounts without scrolling past an oversized header.
- The owner can find download platforms, a user's details and license management within two navigation actions.
- A five-second overview check and a short unprompted walkthrough with Ellis establish whether the terms and layout are understandable; the design is not accepted solely because its screenshots look polished.
- All eight original sections and existing actions have an explicit home. No authentication or license behavior is lost during the frontend migration.
- Every figure has the correct unit, scope and period. Unknown is not zero; guests are not presented as registered customers; Pro accounts are not presented as paid purchases; downloads are not presented as installs.
- No fake live feed, inaccurate comparison badge, misleading global search or non-functional date option ships.
- Test 390px phone, 768px tablet, 1280/1440px laptop/desktop and a wide display; verify 200% zoom, light/dark appearance, keyboard focus, chart values and screen-reader naming.
- Include zero, null, one-point, sparse and larger datasets; long emails/names; hidden small groups; stale data; request retry; identity change; 401/403/428; expired verification; license review errors and unknown write outcomes.
- Background polling neither dims the whole page nor causes layout jumps. Changing tabs/periods never shows a different account's old report.
- Run the web build and focused existing owner frontend/contract checks. Use synthetic cases for create/revoke acceptance; a visual audit never issues a real license or alters a customer account.

## Explicit later enhancements

The frontend revamp can be completed with current endpoints. A durable individual event timeline, desktop notifications for each signup/purchase, complete account search/filtering, Pro purchase provenance, revenue/refunds/MRR and custom date ranges require additional API capabilities or verification of other existing contracts. Keep them in a separate follow-up scope; do not make the redesigned interface depend on promises of unavailable data.

## Source entry points

Use the deployed versions as the starting inventory: `resources/js/portal/pages/OwnerPage.jsx`; `owner/OwnerOverview.jsx`, `OwnerDetails.jsx`, `OwnerWebsiteInsights.jsx`, `OwnerOperations.jsx`, `OwnerAccounts.jsx`, `OwnerLicenses.jsx`, `LicenseForm.jsx`, `LicenseGate.jsx`, `OwnerTwoFactorSetup.jsx`, `OwnerMetric.jsx`, `OwnerTrend.jsx`, `useOwnerReport.js`, `reportIdentity.js`, `format.js`; owner CSS under `resources/css/portal/`; owner login/access components reached by the portal router.

Existing contracts inspected: `/web-api/owner/analytics?days=7|30|90`; paginated `/web-api/owner/accounts?page=N`; owner second-factor verification and existing license endpoints. Backend source reads establish boundaries; changes to those contracts are outside this plan.
