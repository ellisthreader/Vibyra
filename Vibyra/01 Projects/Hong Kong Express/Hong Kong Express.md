---
type: project
status: active
priority: 2
stack:
  - Laravel
  - React
  - TypeScript
project_path: /home/ellis/Desktop/HKE
legacy_project_path: /home/ellis/Desktop/HKE/HongKongExpress-new
repository: https://github.com/LunaTMT/HongKongExpress
last_commit: 2026-08-20
next_action: Consolidate the active customer-journey work and verify profile, orders, addresses, allergens, checkout, and Electron flows end to end
tags:
  - project/hong-kong-express
---

# Hong Kong Express

Laravel, Inertia, React, and TypeScript takeaway-ordering interface.

## Project Record

- **Target users:** Takeaway customers, front-of-house/till staff, kitchen staff, drivers, and managers/admins.
- **Status:** Active again as of 2026-07-16. The prompt log recorded 137 HKE events today across profile, orders, addresses/maps, allergens/nutrition, checkout, live chat, imagery, Electron, and receipt/payment work.
- **Architecture:** Laravel routes/controllers/services and SQLite data -> Inertia React/TypeScript customer/staff UI; Electron wraps the staff application and starts/reuses the local Laravel/Vite stack.
- **Authentication:** Separate customer and staff login contexts; local customer profile/order/address/reward flows were implemented. Production security is not confirmed.
- **Important files:** `routes/web.php`, `app/Services/`, `resources/js/Pages/`, `resources/js/Components/Till/`, `resources/js/Pages/dashboard/`, `database/seeders/data/restaurants.json`, Electron launcher/main files.
- **Integrations:** Stripe Terminal S710 sandbox, Epson network/ESC-POS printing, Google Maps, Geoapify address autocomplete, local Electron runtime.
- **Confirmed local features:** Public menu/basket/checkout, customer profile/orders/addresses, staff/admin dashboard, till, kitchen, menu management, delivery map, reports, seed fallback, generated menu imagery, sandbox reader flow, and receipt prototypes.
- **Planned/unknown:** Clean Git consolidation, end-to-end checkout regression, live Stripe readiness, production deployment, hardware failure recovery, accessibility, and operational security.
- **Skills evidenced:** Laravel/Inertia/React exposure, restaurant workflow design, Electron/POS UI, database/seeding diagnosis, payment/receipt hardware learning, screenshot QA.
- **Source window:** Codex sessions 2026-06-30 to 2026-07-16; repository state last broadly checked 2026-07-10, with focused incident verification on 2026-07-16.

## System Links

- [[01 Projects/Projects|Projects]]
- [[02 Areas/Project Maintenance|Project Maintenance]]
- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[03 Resources/Development Commands|Development Commands]]

## Links

- [Open project folder](file:///home/ellis/Desktop/HKE)
- [Open repository](https://github.com/LunaTMT/HongKongExpress)
- [Open README](file:///home/ellis/Desktop/HKE)
- [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB|Menu image assets must be synced to live DB]]

## Next

- [ ] Review the local changes accumulated after commit `0dea733`; split them into intentional commits with checkout, till, kitchen, profile, image, Electron, payment, and receipt verification.
- [ ] Verify the active customer journey at the exact routes: Profile, Orders, Saved addresses, Allergens, Basket, and Checkout on desktop and mobile.
- [ ] Keep ingredient, allergen, and nutrition values provisional until checked against restaurant recipes, supplier labels, and standard portions.

## Current Development Signal - 2026-07-16

- Orders work emphasized distinct delivery/collection timelines, compact order cards, completed states, empty/search states, and professional downloadable PDF receipts.
- Profile work emphasized compact account editing, payment methods, password/2FA, and language state that changes the entire live site.
- Saved-address work emphasized canonical address-to-map resolution, real Google Maps, discoverable entrance-pin movement, compact cards, and external API-call guards.
- Allergens/nutrition work emphasized simpler discovery and saved warnings. AI-generated research or assumed portions must not be presented as verified legal or safety data.
- Checkout/basket work emphasized shorter steps, less scrolling, and clearer collection/delivery state.
- Prompt evidence establishes active intent, not completion. Use the linked incident/lesson notes and current repository verification for completed claims.

## Last Known Development State - 2026-07-10

- Most implementation activity occurred from 2026-06-30 to 2026-07-05; focus later moved to RelayClarity and Vibyra.
- Local work includes customer ordering/checkout/profile, staff/admin Electron surfaces, till/kitchen/menu/maps/reports, customer-vs-staff auth context, menu seed fallback, generated menu images, Stripe S710 sandbox checks, Epson receipt printing, and QR receipts.
- Many changes were validated locally with Vite/PHP/tests/screenshots, but the worktree had 344 changed/untracked files and is far ahead of the last pushed commit.
- Payment evidence is sandbox-only. Do not claim live payment readiness or production operation.

## AI Handoff

- Confirm current ownership and maintenance status before investing in new work.
- Keep any reusable Laravel/Inertia notes in [[03 Resources/Resources|Resources]].
- Before finishing any menu/catalog/image work, verify the active database state as well as seed files and public assets.
- If a terminal learns a reusable project-specific failure mode, add it here or under [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB|HKE lessons]] before closing the task.
- Current Codex review and operating rules: [[HKE Codex Chat Review - 2026-07-03]].
- Current checkout incident report: [[HKE Checkout Incident - 2026-07-03]].
- Stripe Terminal timeout and safe-retry incident: [[HKE Stripe Terminal Timeout Reconciliation - 2026-07-16]].
- Desktop startup port-collision incident: [[HKE Desktop Startup Port Collision - 2026-07-15]].
- Electron cross-app process-isolation incident: [[HKE Electron Cross-App Process Isolation - 2026-07-16]].
- Saved Addresses Google Maps false-failure incident: [[HKE Saved Addresses Google Map False Failure - 2026-07-16]].
- Saved-address entrance pin and Edit modal incident: [[HKE Saved Address Entrance Pin Discoverability - 2026-07-16]].
- Landing video first-frame and geometry lesson: [[HKE Landing Video First Frame Mismatch - 2026-07-15]].
- Profile security and language-state incident: [[Profile security and language state must share the live account context]].
- Cross-project prompt evidence and unresolved loops: [[99 Meta/Prompt Activity Review - 2026-07-16]].

## Terminal Working Rules

> [!important]
> The running HKE app reads menu item images from the database, not directly from seed JSON. For generated menu images, sync `database/seeders/data/restaurants.json`, `menu_items.image_url`, and related `images.path`.

- Current Windows workspace: `/home/ellis/Desktop/HKE`
- For image/menu changes, validate the actual page data source through `MenuCatalogService`.
- Do not treat generated files under `public/images/menu-items` as complete until the live DB rows are updated or the seeder has been rerun intentionally.

## 2026-06-30 Landing Screen Background Refresh

> [!success]
> Replaced the blurry first loading/landing screen background with a regenerated hero asset and confirmed the menu seed data is visible.

### Assets

- Project asset: `/home/ellis/Desktop/HKE/public/images/hke-landing-bg.png`
- Vault attachment: ![[_attachments/hke-landing-bg-2026-06-30.png]]

### Code Changes

- `resources/js/Pages/HomeLanding.tsx` now uses `/images/hke-landing-bg.png` for the full-screen landing background.
- `resources/css/app.css` adds `hke-landing-photo` and `hke-landing-backdrop` styles to keep the generated hero image sharp and readable behind the logo.
- The previous blur-heavy abstract background/video treatment was removed from the first viewport.

### Generated Image Prompt

```text
High-end commercial food photography for a Chinese takeaway website landing/loading hero. Red and gold tabletop, crispy duck pancakes, hoisin sauce, Cantonese dishes around the edges, clear central safe area for an existing logo overlay, sharp realistic lighting, no text, no logos, no watermark, no people, no heavy blur.
```

### Verification

- `npx vite build` passed.
- `/menu/items` returned seeded menu JSON including `Aromatic Crispy Duck with Pancakes`.
- Database seed state checked earlier: 1 restaurant, 179 menu items, 18 tags.

### Follow-Up

- [ ] Review the landing page visually in browser after refresh and hard-cache clear.

## 2026-07-02 Menu Catalog Empty DB Fallback

- Added permanent fallback note: [[01 Projects/Hong Kong Express/Lessons/Menu catalog must fall back to seed JSON when DB is empty|Menu catalog must fall back to seed JSON when DB is empty]].
- Current lesson: menu organisation can be correct while the page still renders empty if `MenuCatalogService` has no database rows; verify the active data source, not just seed JSON.
