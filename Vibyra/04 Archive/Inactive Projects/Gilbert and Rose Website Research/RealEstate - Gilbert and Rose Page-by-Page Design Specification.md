---
title: RealEstate - Gilbert and Rose Page-by-Page Design Specification
date: 2026-07-11
tags:
  - project/real-estate
  - design-specification
  - frontend
  - gilbert-and-rose
status: implemented-with-explicit-backend-dependencies
related:
  - "[[Gilbert and Rose Website Research]]"
  - "[[Gilbert and Rose - Brand Styling Logos and Assets]]"
  - "[[Gilbert and Rose - Page and Content Inventory]]"
  - "[[Gilbert and Rose - Property Data and Search]]"
  - "[[Gilbert and Rose - Verified Staff Directory]]"
  - "[[RealEstate - Customer Account and Dashboard Plan]]"
repository: /home/ellis/Desktop/RealEstate
---

# RealEstate - Gilbert and Rose Page-by-Page Design Specification

## Implementation progress — 2026-07-11

> [!success] Safe page-by-page implementation completed
> The repository now contains the complete planned public route surface, the typed published-property journey, researched service/trust content, the branded public tour, and the restyled agent workspace. Actions without a real secure backend are deliberately presented as unavailable instead of simulating success.

Completed:

- [x] Brand colour, typography, spacing, elevation and accessibility tokens
- [x] Accessible public shell, skip link, responsive header, mobile navigation and valuation strip
- [x] Normal-flow footer with verified contact, legal and social links
- [x] Homepage, Sales, Sell Your Home, Tenants and Landlords pages
- [x] New Homes, Commercial, Business Transfer and Care Homes pages
- [x] Typed and runtime-validated `GET /public/properties` contract with bounded pagination and filters
- [x] Published-only public property search, loading, error, empty and result states
- [x] Public property detail using factual fields already present in the database
- [x] Team directory containing all 53 researched staff records, 10 departments, portrait fallbacks and validated biography data
- [x] Accessible team filter and biography dialog with Escape close, focus restoration and keyboard focus loop
- [x] Locations index and all 12 verified location routes with legacy redirects
- [x] Contact, valuation, account-state, privacy, complaints and human sitemap pages
- [x] Secure customer registration/login, protected `/account` dashboard and logout
- [x] Public-tour and agent-workspace visual redesigns
- [x] Agent routes moved beneath `/dashboard` with legacy UUID/property/tour-editor compatibility routing
- [x] Per-route document titles, base metadata, route code splitting and factual fallback content
- [x] Unit/component tests plus seven Playwright public-journey tests
- [x] Desktop and mobile visual review of team, locations, service and property-search layouts
- [x] Repository README and architecture documentation synchronised with the implementation

Verified data retained locally:

- [x] G&R, Niche Homes and five partner/accreditation brand assets
- [x] Exact 53-record team biography/favourites/Instagram snapshot in `apps/web/public/content/team.json`
- [x] 49 verified staff portrait URLs plus branded monogram fallbacks for the four source records without portraits
- [x] 12 verified location records and their source area-guide links
- [x] Verified company address, sales telephone number and Instagram, Facebook, TikTok and YouTube destinations

Explicit backend/schema dependencies — not fabricated:

- [x] Customer authentication and protected dashboard foundation
- [ ] Customer favourites, alerts and password-reset workflows
- [ ] Contact, viewing and valuation submission APIs, consent storage and delivery workflows
- [ ] Property price, qualifier, transaction type, availability, features, galleries, floor plans, EPC, map and related-listing data absent from the current schema
- [ ] Server-rendering/prerendering, canonical tags, structured data and XML sitemap generation
- [ ] Advanced tour controls such as fullscreen/help/reduced-motion camera mode where the existing viewer does not expose a safe adapter contract

> [!warning] Production boundary
> The incomplete items above require product decisions, new validated DTOs, database migrations and/or secure services. The implemented pages expose honest phone, source-link or unavailable states until those dependencies exist.

> [!abstract] Outcome
> This is the implementation specification for bringing the verified Gilbert & Rose public-site design and content model into the RealEstate platform while preserving its existing property digital-twin architecture. It covers the public marketing website, listing discovery, staff/location content, account screens, agent dashboard and Gaussian-splat tour experience.

## Product split

The web application should present three clearly separated experiences:

1. **Public marketing and discovery** — branded service pages, locations, staff, listings and valuation/contact journeys.
2. **Public property experience** — property detail, photography, structured information and Gaussian-splat tour.
3. **Authenticated agent workspace** — the existing dashboard, property creation, scan/model processing and tour editing.

Public pages consume typed API responses only. Agent pages remain organisation-authorised. The 3D tour enhances property information but never replaces photos, address, description, features, floor plan, EPC or contact actions.

## Route architecture

| Experience | Proposed route | Current equivalent/status |
| --- | --- | --- |
| Marketing gateway | `/` | Currently agent dashboard; dashboard moves to `/dashboard` |
| Residential sales | `/sales` | New |
| Sell a property | `/sell-your-home` | New |
| Tenants | `/tenants` | New |
| Landlords | `/landlords` | New |
| New homes | `/new-homes` | New |
| Commercial | `/commercial` | New |
| Business transfer | `/business-transfer` | New |
| Care homes | `/care-homes` | New |
| Property search | `/properties` | New public index; avoid collision with agent routes by nesting agent routes below `/dashboard` |
| Property detail | `/properties/:slug` | New public page |
| Public digital tour | `/tour/:slug` | Exists; redesign and connect from property detail |
| Locations index | `/locations` | New |
| Location landing | `/locations/:slug` | New canonical pattern; legacy town slugs can redirect |
| Team | `/team` | New |
| Contact | `/contact` | New |
| Valuation chooser | `/valuation` | New |
| Account login | `/login` | New |
| Registration | `/register` | New |
| Password reset | `/forgot-password` | New |
| Saved properties | `/account/saved` | New |
| Agent dashboard | `/dashboard` | Move existing `/` |
| New agent property | `/dashboard/properties/new` | Move existing route |
| Agent property detail | `/dashboard/properties/:propertyId` | Move existing route |
| Agent property edit | `/dashboard/properties/:propertyId/edit` | Move existing route |
| Tour editor | `/dashboard/models/:modelId/tour-editor` | Move existing route |
| Privacy | `/privacy` | New |
| Complaints | `/complaints` | New |
| Human sitemap | `/sitemap` | New |

> [!warning] Compatibility
> Existing agent URLs should redirect to their new `/dashboard/...` equivalents for at least one release. Existing `/tour/:slug` links must remain unchanged.

## Global design system

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| `brand.charcoal` | `#363636` | Navigation, footer, strong text, dark controls |
| `brand.yellow` | `#FFF200` | Primary CTA, emphasis, active filters |
| `brand.yellowSoft` | `#FAF400` | PWA/background variation |
| `surface.page` | `#F3F4F6` | Global page canvas |
| `surface.card` | `#FFFFFF` | Cards, forms, search panels |
| `text.primary` | `#363636` | Body/headings |
| `text.muted` | `#808080` | Metadata and secondary labels |
| `border.default` | `#E5E7EB` | Inputs, pills and cards |
| `status.error` | Accessible dark red on pale red | Errors and destructive actions |
| `status.success` | Accessible dark green on pale green | Confirmations and completed processing |

Typography uses Rubik. Main display headings use weights 700–900, tight line height and occasional uppercase treatment. Square Peg is reserved for rare decorative annotations and must not carry essential information.

### Shape, elevation and spacing

- Content maximum: 1,224–1,280px depending on page type.
- Desktop page padding: 24–32px; mobile: 12–16px.
- Primary card radius: 16px; large media radius: 18–24px; pills: fully rounded.
- Dark navigation radius: 12px desktop; edge-to-edge mobile.
- Shadows remain soft and broad; avoid multiple competing elevation levels.
- Minimum interactive target: 44×44px.

### Global public shell

Desktop uses a fixed, centered charcoal-gradient navigation card with the G&R monogram, uppercase section links and yellow account button. It hides on downward scroll and returns on upward scroll. Mobile uses a compact charcoal header, hamburger menu and full-width yellow valuation strip.

The page body is light grey. Public content ends in a rounded-bottom foreground sheet that reveals a fixed charcoal footer. Footer sections include contact, social links, useful links, resources, legal identity and accreditation marks. Implement the layered footer only when it remains keyboard- and screen-reader-safe; otherwise use a normal document-flow footer with the same appearance.

### Shared public components

- `PublicSiteLayout`
- `PublicHeader` and `MobileMenu`
- `ValuationStrip`
- `PublicFooter`
- `HeroMedia`
- `ReviewPill`
- `PropertySearchPanel`
- `PartnerLogoStrip`
- `PropertyCard` and `PropertyCarousel`
- `EditorialSplitSection`
- `MetricCardRow`
- `FaqAccordion`
- `ValuationBanner`
- `TeamCard` and `TeamMemberDialog`
- `LocationCard`
- `ContactActions`
- `LegalPageLayout`

All component content arrives through typed props. Repeated marketing content should be driven by validated page configuration rather than duplicated JSX.

## Page-by-page public design

### 1. Homepage `/`

**Purpose:** Brand gateway and fast routing into the five main business divisions.

**Composition:** Minimal full-viewport branded gateway; prominent G&R mark; “The property marketing professionals”; large division cards for Sales, Lettings, New Homes, Commercial and Business Transfer; Niche Homes external card; valuation CTA; compact legal footer.

**Mobile:** Single-column full-width cards with large tap targets. Keep the first viewport focused on identity and two highest-priority choices.

**States:** Static content skeleton if configuration loads remotely; safe fallback links if imagery fails.

### 2. Sales `/sales`

**Purpose:** Buyer discovery plus company trust and residential-sales positioning.

**Composition:** Sales header; cinematic rounded hero with review pill, yellow eyebrow, stacked white headline and overlaid property search; monochrome partner strip; local-experts editorial section; team/contact CTAs; six-year video card; instant valuation block; metrics; latest sale listings; Niche Homes promotion; reviews.

**Mobile:** Portrait hero, centered copy, search card near bottom of media, reduced logo strip and single-column editorial cards.

**Primary actions:** Search properties, request valuation, view team, contact, view all sales.

### 3. Sell Your Home `/sell-your-home`

**Purpose:** Explain the marketing service and convert sellers to valuation leads.

**Composition:** Seller hero and review proof; alternating full-bleed image/text sections for photography, cinematic video, drone, branded collateral, optimised website listings, 360 tours and support; persistent but non-obstructive valuation tab on large screens; final yellow valuation banner.

**Implementation note:** Use consistent section components while varying media alignment. Do not reproduce spelling errors from the source content.

### 4. Tenants `/tenants`

**Purpose:** Rental discovery and support for current tenants.

**Composition:** Rental hero with property search; lettings partner strip; two editorial sections about finding a home and Southend rental options; latest rentals; operational metrics; prominent Fixflo repair card; tenant FAQ; reviews.

**Primary actions:** Search rentals, report repair, create alert, contact lettings.

**Safety:** Repair reporting opens the approved external Fixflo route with an external-link indicator.

### 5. Landlords `/landlords`

**Purpose:** High-information conversion page for landlord services.

**Composition:** Hero/valuation CTA; department introduction and lettings-team carousel; property search; “How we market” sections for Rex matching; six differentiator cards; Goodlord tenancy section; Renters’ Rights guide; mydeposits compliance; Inventory Hive; rent/legal protection; Fixflo; PayProp; Let Only/Fully Managed comparison; journey/process timeline; WhatsApp and valuation CTA.

**Mobile:** Convert dense two-column product sections to stacked cards and keep the plan comparison horizontally readable without forcing page-wide scrolling.

**Compliance:** Legal claims and downloadable guides require owner-approved copy and reviewed dates.

### 6. New Homes `/new-homes`

**Purpose:** Serve buyers and land/development partners.

**Composition:** New-homes hero/search; portal/accreditation strip; new-home and land/development editorial pair; latest new homes; previous-development cards for Savannah Heights, Nashlea Farm and Langdon Hills; FAQs; reviews; developer contact CTA.

**Property cards:** Clearly mark new-build status, development name, completion phase and reservation availability.

### 7. Commercial `/commercial`

**Purpose:** Commercial search, management and valuation.

**Composition:** Commercial hero with two CTAs; specialist portal strip; management and tenant-acquisition editorials; commercial category pills with dedicated icons; latest listings; 75+/42,500+/6 metric row; FAQ; reviews.

**Filters:** All, office, retail, warehouse, land and workshop.

### 8. Business Transfer `/business-transfer`

**Purpose:** Generate confidential business-sale enquiries and expose live opportunities.

**Composition:** Business-transfer hero; business portal strip; “sell fast” and agent-service editorials; category icons for guest house, retail/convenience, hairdresser/barber, café, restaurant/takeaway and all; latest business listings; metrics; FAQ; valuation CTA.

**Privacy:** Enquiry forms must state how confidential business information is handled.

### 9. Care Homes `/care-homes`

**Purpose:** Specialist care/retirement-property discovery content.

**Composition:** Sensitive, calm hero; residential-care and lifestyle editorials; appropriate listings/search; metrics only when verified; informational FAQ; review/social block.

**Content safety:** Clearly distinguish property guidance from medical, financial or legal advice.

### 10. Property Search `/properties`

**Purpose:** Unified browsing across residential sale, rent, new homes, commercial and business stock.

**Desktop:** Search summary and sort at top; filter sidebar or filter bar; responsive three-column cards; optional map toggle. Filters include transaction, listing class, location/radius, price, bedrooms, bathrooms, type, new-home flag and availability.

**Mobile:** Sticky “Filters” and “Sort” controls open accessible bottom sheets/dialogs. Results are single-column. Preserve filters in URL query parameters.

**States:** Initial loading skeletons; updating indicator that does not block existing results; zero-results suggestions; recoverable API error; pagination/load-more; stale listing status.

**Card content:** Main image, status, price qualifier, address/locality, type, bedroom/bathroom counts, floor area if known, favourite control and optional tour badge. Cards must remain informative without imagery.

### 11. Property Detail `/properties/:slug`

**Purpose:** Full factual and visual property presentation leading to viewing/contact/tour.

**Composition:** Address/type upper left; status/price upper right; large rounded gallery; facts row; summary and description; key features; floor plan; EPC; map/local transport/education; agent/contact card; book-viewing form; related properties; valuation banner.

**Digital-twin enhancement:** Add a highly visible “Explore 3D tour” action beside Gallery/Floor plan when a published model exists. Provide a static fallback image and all property details when the model is unavailable.

**Mobile:** Price/status precede gallery, facts wrap into a two-column grid, and a bottom contact bar offers Call, Enquire and Tour without covering content.

**States:** Listing unavailable, under offer, sold/let, media error, model processing, model unavailable and enquiry success/error.

### 12. Public Tour `/tour/:slug`

**Purpose:** Immersive but accessible digital-twin viewing.

**Redesign current page:** Apply charcoal/yellow branding; keep property name/status and “Back to property” visible; place the 3D viewport first without blocking the entire page while loading; retain room/viewpoint navigation; render hotspot details in an accessible drawer; follow with ordinary property description and key facts.

**Controls:** Room selector, viewpoint selector, reset camera, fullscreen, help, reduced-motion mode and keyboard instructions. Touch controls need clear affordances.

**Fallback:** If WebGL or the model fails, show property imagery, description and contact actions rather than a dead end.

### 13. Locations `/locations`

**Purpose:** Browse the 12 verified Essex markets.

**Composition:** Location-search hero; 12 photo cards for Leigh-on-Sea, Canvey Island, Benfleet, Southend-on-Sea, Rayleigh, Wickford, Shoebury, Basildon, Hockley, Great Wakering, Westcliff and Rochford; local-expertise CTA; nearby/latest properties.

### 14. Location Detail `/locations/:slug`

**Purpose:** SEO-quality local guide plus relevant inventory.

**Composition:** Local photograph hero; concise area overview; lifestyle/transport/education sections; reasons-to-live cards; local market facts with timestamps; matching property grid; valuation/contact block; related areas.

**SEO:** Unique title, description and canonical route. Do not duplicate generic town copy. Redirect verified legacy “houses-for-sale-*” paths.

### 15. Team `/team`

**Purpose:** Human trust and staff discovery.

**Composition:** Centered heading; filter pills for all 10 live departments; responsive card grid; 4:3 portraits; name/title/arrow captions; modal/dialog with portrait, biography, role, Instagram handle and favourites.

**Data:** Use the 53-record structure documented in [[Gilbert and Rose - Verified Staff Directory]]. Missing portraits use a branded monogram/initial placeholder, never a broken image.

**Mobile:** Two-column compact grid where space permits, otherwise one column. The biography dialog becomes a full-height sheet with focus trap and close button.

### 16. Contact `/contact`

**Purpose:** Route enquiries to the correct department.

**Composition:** Contact hero; address/map; Sales, Lettings and Commercial call cards; business hours; office photograph; validated enquiry form with department, name, email, phone, message and consent; success confirmation.

**Accessibility:** Telephone links include department names. Map must have a textual directions alternative.

### 17. Valuation `/valuation`

**Purpose:** Choose residential sale, rental, commercial or business valuation.

**Composition:** Four large cards with short explanation, expected process/time and CTA. External valuation routes retain campaign attribution. Provide fallback phone/contact routes.

### 18. Authentication `/login`, `/register`, `/forgot-password`

**Purpose:** Account access for favourites and alerts, visually separate from staff/agent authentication if roles differ.

**Composition:** Centered white card on light-grey canvas, compact branded header, strong label hierarchy, password visibility, validation summary, submit progress and links between auth pages. Registration explains saved listings, alerts and favourites.

**States:** Idle, submitting, field error, server error, email-sent success and expired reset token.

### 19. Legal `/privacy`, `/complaints`

**Purpose:** Readable, authoritative policy content.

**Composition:** Narrow 720–800px content measure; title, last-reviewed date, table of contents, semantic headings, printable styling and contact/escalation card. No animated distractions.

### 20. Sitemap `/sitemap`

**Purpose:** Human-readable navigation and crawl support.

**Composition:** Grouped links for services, locations, account, legal and active properties. Avoid rendering hundreds of links without pagination or grouping. XML sitemap should be partitioned by page type as inventory grows.

## Authenticated agent workspace redesign

### Dashboard `/dashboard`

Replace the generic slate shell with a quieter operational variant of the brand: charcoal top bar, yellow primary action, light-grey canvas and white property cards. Preserve current list loading, error and empty states. Add processing-status summary, search/filter, recently updated properties and clear public-preview links.

### Property create/edit

Use a two-column desktop form with sticky summary/actions; single column on mobile. Group address, property facts and description. Preserve Zod-backed validation and accessible inline errors. Add explicit success state and unsaved-changes warning.

### Agent property detail

Use a branded property header with status and public-preview action. Keep separate sections for public preview, scans and models. Surface processing progress without blocking other property work. Each scan/model needs status, timestamp, error detail, retry/action and checksum/source facts where relevant.

### Tour editor

Desktop uses a large viewer workspace plus a structured side panel for Rooms, Viewpoints and Hotspots. Mobile/tablet use tabs or drawers. Preserve keyboard access and explicit save/error feedback. Never report completion while uploads/verification remain unfinished.

## API and data contracts required

- Public navigation/page configuration
- Public property search request/response
- Public property summary/detail DTOs
- Published-tour availability and signed model URL
- Team member and department DTOs
- Location summary/detail DTOs
- Contact/viewing/valuation request DTOs
- Authentication, favourites and alerts DTOs

Runtime validation belongs in `packages/validation`; shared DTOs/enums in `packages/shared-types`; public API access in `packages/api-client`. The web app must never read the database directly. Any future Rex integration sits behind an API/worker adapter, not inside React components.

## Accessibility and quality gates

- Full keyboard navigation and visible focus treatment.
- Semantic landmarks, headings and form labels.
- Dialog focus trap, Escape close and focus restoration.
- Alt text that describes content rather than repeating filenames.
- WCAG AA contrast; charcoal-on-yellow and white-on-charcoal combinations must be measured.
- Respect `prefers-reduced-motion` across page reveals, carousels and viewer camera transitions.
- All pages include loading, empty, error and success states where data/actions exist.
- Property information remains available without WebGL, animation or JavaScript-enhanced carousels.
- Mobile layouts tested at 320, 375, 390 and 430px widths; desktop at 1,280 and 1,440px.
- Core Web Vitals budget: responsive images, lazy-loaded below-fold media, fixed aspect ratios, no blocking third-party widgets.

## Implementation sequence

### Phase 1 — Foundation

- Add design tokens, Rubik font and shared public shell.
- Move/redirect agent routes beneath `/dashboard`.
- Build shared cards, CTA, FAQ, logo strip, hero and loading/error components.
- Add Storybook or focused component tests if adopted by the repository.

### Phase 2 — Property journey

- Build public search and property detail.
- Restyle and connect public tour.
- Add typed public APIs, filters, availability and fallback states.

### Phase 3 — Priority marketing

- Build Sales, Sell Your Home, Tenants and Landlords.
- Add valuation, contact and account pages.

### Phase 4 — Specialist divisions

- Build New Homes, Commercial, Business Transfer and Care Homes.
- Add specialist filters and compliance-reviewed content.

### Phase 5 — Trust and SEO

- Build Team, Locations, location detail, legal and sitemap pages.
- Add metadata, canonical URLs, structured data and sitemap partitions.

### Phase 6 — Agent workspace polish

- Restyle dashboard, forms, property detail and tour editor.
- Run end-to-end tests across public discovery → property → tour and agent property → model → publish flows.

## Definition of done for each page

- Matches this content hierarchy at desktop and mobile breakpoints.
- Uses shared tokens/components rather than one-off styling.
- Uses typed, validated external data.
- Includes keyboard, focus, reduced-motion and non-3D fallbacks.
- Includes loading, empty, error and success states as applicable.
- Has unit/component tests for new behaviour and Playwright coverage for critical journeys.
- Passes `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- Includes application-specific integration/E2E checks where affected.

## Recommended next task

> [!todo] Add the missing property-marketing schema
> Define and migrate typed fields for price/qualifier, transaction and property type, availability, media gallery, features, floor plans and EPC data. Then extend the public summary/detail DTOs and UI without changing the existing published-only contract or fabricating values.
