---
title: Graphite And Cobalt Colour System
tags:
  - vibyra
  - design-system
  - colour
  - approved
status: approved
approved: 2026-07-15
---

# Graphite And Cobalt Colour System

Graphite + Cobalt is the approved Vibyra colour system for the Electron desktop
app, Expo phone/browser client, and public Laravel marketing site. It replaces
purple, violet, and magenta as general interface accents. Future UI work must
use semantic tokens rather than introducing surface-specific brand colours.

## Canonical Palette

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | `#0E0F12` | `#F4F5F7` |
| Rail | `#13151A` | `#FAFAFB` |
| Surface | `#181A20` | `#FFFFFF` |
| Elevated | `#20232A` | `#F0F2F5` |
| Workspace canvas | `#101115` | `#FBFBFC` |
| Border | `#2B2F38` | `#D9DDE4` |
| Primary text | `#F5F7FA` | `#171A21` |
| Muted text | `#A6ADBA` | `#626A78` |
| Accent | `#5B7CFA` | `#315BD8` |
| Accent hover | `#7490FF` | `#2449B8` |
| Accent soft | `rgba(91,124,250,.14)` | `rgba(49,91,216,.09)` |
| Primary action fill | `#4667E8` | `#315BD8` |
| Primary action hover | `#3D5ACF` | `#2449B8` |
| On primary action | `#FFFFFF` | `#FFFFFF` |
| Success | `#37C78A` | `#147A57` |
| Warning/token | `#E8A94B` | `#A96812` |
| Error | `#F06472` | `#C9364B` |

The approved dark reference concept is `tmp/vibyra-cobalt-concept.html`. The
matching warm light reference is `tmp/vibyra-light-concept.html`; it demonstrates
the pearl-neutral foundations and restrained cobalt interaction treatment.
These are visual direction references, not production source.

## Usage Rules

- Keep roughly 90% of product chrome graphite/neutral, 8% cobalt interaction,
  and 2% semantic status colour.
- Use bright cobalt for links, focus rings, active input controls, meaningful
  AI activity, and a thin selected-workspace edge where needed. Filled primary
  actions use the darker action token with white text; white on `#5B7CFA`
  fails normal-text AA and is not an approved button pairing.
- Keep ordinary navigation, tabs, cards, rows, and hover states neutral.
- Prefer solid cobalt actions. Do not restore purple/pink gradients, glow-heavy
  decoration, or full-surface accent fills.
- Preserve the V geometry. Product chrome should use a monochrome or cobalt
  treatment; dedicated app/store asset exports must preserve platform metadata
  and must not overwrite the canonical shared mark accidentally.
- Dark, light, and auto/system themes use the same semantic roles. Do not add a
  second theme store or a feature-specific palette.

## Semantic Exceptions

Do not blindly recolour provider logos, terminal ANSI output, code syntax,
success/warning/error states, credit-token amber, user content, project
previews, plan artwork, or third-party imagery. Provider colour may identify
provider-owned content but must not recolour surrounding Vibyra chrome.

## Source Ownership

- Expo phone/browser: `src/styles/theme.ts`, with appearance owned by
  `src/context/PreferencesContext.tsx`; update the compatibility maps in
  `src/screens/workspace/styles/themeLightColors.ts` and then remove hardcoded
  accent gradients in `src/screens/` and `src/components/`.
- Desktop: `desktop/assets/app.theme.css` is the semantic source of truth;
  `app.theme-*.css`, terminal audit layers, and runtime xterm/Monaco theme
  adapters consume it.
- Marketing: `backend/resources/css/marketing.css` owns Tailwind theme tokens;
  `backend/resources/js/marketing/ui.jsx` owns shared primitives and the other
  React marketing components consume semantic utilities rather than hex values.

## Release Standard

Every surface must pass accessible contrast, explicit dark/light/auto checks,
desktop and narrow screenshots, and a search for unauthorized legacy purple or
magenta literals. A colour migration may not alter routes, state, permissions,
approval flows, persistence, pairing, billing, terminal processes, or component
ownership merely to achieve the visual change.

## Desktop Implementation Status

The Electron desktop migration was completed on 2026-07-16 across the auth
welcome, application shell, Projects, shell chat, Terminals, companion
workspace, Settings, profile, billing, pairing, modals, screenshot editor, and
legacy fallback sheets. `desktop/assets/app.theme.css` remains the token source;
late theme/audit sheets consume it, and filled actions use the separate darker
action token rather than white text on the brighter focus accent.

Desktop auth uses the native Graphite/Cobalt artwork
`src/assets/front-auth-desktop-4k.webp` and the dedicated transparent
`src/assets/vibyra-cobalt.png` mark. That cobalt mark is canonical across every
first-party Desktop V placement and its native PNG/ICO exports. The shared
mobile/non-Desktop mark `src/assets/vibyra.png` remains untouched; Desktop
should not use CSS hue rotation or reintroduce the older purple nebula.

`desktop/assets/app.cobalt-source-audit.test.mjs` scans first-party desktop CSS
and JavaScript for retired violet/pink literals. Internal legacy class/tone names
such as `.purple` may remain only as compatibility aliases whose rendered colour
is cobalt. ANSI magenta, provider logos, semantic status colours, user content,
and previewed project content remain approved exceptions.

Live validation used a fresh Electron restart and `/health` 200, plus fresh
browser auth and authenticated terminal-shell screenshots. Theme-focused tests,
JavaScript syntax checks, and CSS structure checks passed. The broader Desktop
AI suite passed 531 of 536 tests with 3 skips; the remaining blank-Auto PTY test
timed out waiting for external process output and is not theme-owned. Preview
tests had six dev-port failures while an unrelated RealEstate Vite server owned
`127.0.0.1:5173`. Full `tsc --noEmit` remained active beyond five minutes and
was stopped without a compiler diagnostic; do not record either environment
result as a Graphite/Cobalt regression.

The 2026-07-16 Warm Pearl completion pass made the workspace canvas an explicit
semantic role. PTY/xterm, Monaco, Preview, and Memory consume
`--color-workspace` (`#FBFBFC` in light/Auto-light) while shell and modal/card
surfaces retain their existing roles. Shared modals and billing use white light
surfaces, and `app.light-theme-contract.test.mjs` plus
`app.light-shell-projects-chat.test.mjs` protect exact tokens, Auto-light
parity, contrast, and shell/Projects/chat ownership.

## Mobile Implementation Status

The Expo phone/browser migration was completed on 2026-07-17 across native
startup, auth, onboarding, welcome/setup, workspace shell, chat and tools,
Projects and publishing, pairing and permissions, Community chrome, profile,
billing, credits/usage, settings, previews, loading, and shared WebView fallback
art. It did not change routes, state ownership, permission flows, pairing,
billing, publishing, preview policy, or persistence behavior.

`src/styles/theme.ts` is the exact semantic palette contract and
`src/context/PreferencesContext.tsx` remains the only Dark/Light/Auto store.
`App.tsx` repaints the mounted workspace style proxy without key-remounting the
auth or workspace trees. Filled actions use `action`/`actionPressed`; bright
accent remains reserved for focus, links, progress, and selected edges.

Active first-party auth, welcome, onboarding, and paywall atmospheres now use
`src/assets/front-auth-desktop-4k.webp`, and first-party V placements/splash use
`src/assets/vibyra-cobalt.png`. Retired raster files may remain in the asset
folder for history or content artwork but must not be restored as product
chrome. Provider identity, syntax, status colours, credit amber, user content,
published project previews, and plan/third-party artwork remain exceptions.

`src/styles/mobileThemeContract.test.mjs` protects exact tokens and action
contrast. `src/styles/mobileThemeSourceAudit.test.mjs` recursively rejects
legacy violet/pink literals from production TypeScript, with narrow exceptions
for syntax, explicit compatibility lookup keys, and embedded community demo
content. `workspaceStyleCascade.test.mjs` protects every dark winner and light
transform. Completion validation passed 134 mobile tests, full `tsc --noEmit`,
the 572-file/200-line gate, Expo public config resolution, and a fresh 390x844
browser auth screenshot at `tmp/mobile-cobalt-auth.png`.
