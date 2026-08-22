---
title: HKE Codex Chat Review - 2026-07-03
date: 2026-07-03
tags:
  - project/hong-kong-express
  - codex-review
  - incident
  - ai-handoff
status: active
related:
  - "[[Hong Kong Express]]"
  - "[[HKE Checkout Incident - 2026-07-03]]"
---

# HKE Codex Chat Review - 2026-07-03

Six sub-agents reviewed local Codex history, the HKE repo, the checkout incident note, and related desktop/UI sessions. The review focused on repeated prompts, recurring agent errors, causes of slow fixes, and missing project skills.

## Corpus Reviewed

- `C:\Users\Ellis\.codex\history.jsonl`
- `C:\Users\Ellis\.codex\sessions\2026\06\30\rollout-2026-06-30T21-26-23-019f1a36-2281-7251-a4c8-6ab868b3e8bc.jsonl`
- `C:\Users\Ellis\.codex\sessions\2026\07\02\rollout-2026-07-02T11-00-18-019f2245-a9c4-7171-8a32-6b2fd33d1baf.jsonl`
- `C:\Users\Ellis\.codex\sessions\2026\07\03\rollout-2026-07-03T09-28-43-019f2718-2c3a-7952-968d-3b3e78a82f6c.jsonl`
- `/home/ellis/Desktop/HKE`
- `[[HKE Checkout Incident - 2026-07-03]]`
- `/home/ellis/Desktop/HKE/DASHBOARD_TILL_DESIGN_ROLLOUT_PLAN.md`
- `/home/ellis/Desktop/HKE/HKE_MODAL_AUDIT_REPORT.md`

## Repetitive Prompts

- "Run website", "give me HKE link", "run desktop app", and "fix this" recur across local project sessions.
- Checkout, till, order flow, card reader, and receipt work recur enough to need a dedicated HKE checkout/payment skill.
- UI prompts often repeat because verification misses the exact visual state: screenshot matching, no scroll, no overlap, modal stacking, overlay hit-testing, and mobile/desktop screenshots.
- Desktop prompts repeat because the checked entry point is often not the exact one the user used. Desktop shortcut, taskbar pin, process command, app icon, and working directory must all be inspected.
- User repeatedly asks for sub-agents and deep review, but many failures were not caused by too little planning; they were caused by not reproducing the exact path first.

## Why The Checkout Incident Happened

- The first debugging pass tested backend routes, response times, and order POST behavior before testing the exact cart `Checkout` button.
- The header cart `Checkout` button only closed the basket overlay and did not navigate to `/checkout`.
- Electron dev startup used nested `npm` spawning on Windows and could leave stale Vite/hot state behind.
- Manual PHP, Vite, and Electron processes made it harder to separate app bugs from dev-server state.

## Why It Took Too Long

- The agent followed plausible backend/server leads before reproducing the user's click path.
- Windows startup handling was noisy: missing `vendor`, `node_modules`, `.env`, Composer not on PATH, `npm` vs `npm.cmd`, port conflicts, stale `public/hot`, and raw PHP server routing.
- Stop conditions were weak. After a couple of failed server starts, the agent should have stopped trying new ports and inspected owner processes/logs.
- Status updates were inconsistent: some long gaps had little useful state, while some updates did not name the remaining risk.
- Similar desktop work repeated the same pattern: the agent verified one launcher, but the user's broken pinned taskbar entry was a different shortcut.

## Fixes Already Added

- `resources/js/Layouts/Navbar.tsx`: cart checkout now closes the overlay and navigates to `route('checkout')`.
- `scripts/electron-dev.mjs`: Electron dev launch now uses the Electron binary directly and passes an absolute Node binary.
- `electron/main.cjs`: Electron starts Vite through `node node_modules/vite/bin/vite.js`.
- `scripts/check-checkout-regressions.mjs`: build-time guard now checks Navbar checkout navigation, Electron startup rules, and Till payment modal entry.
- `package.json`: `npm run build` runs `npm run check:checkout-regressions` first.
- `resources/js/Components/Till/components/panels/summary/OrderSummaryPanel.tsx`: primary Till `Pay Now` now sets a payment type before opening the payment modal, defaulting to card when none is selected.

## Verification Status

- `npm run check:checkout-regressions` passed.
- `npm run build` passed.
- Build completed with non-fatal existing Vite warnings about `/images/hke-login-bg.png` runtime resolution and `AuthModal` being both dynamically and statically imported.

## Operating Rules For Future HKE Work

- For UI bugs, reproduce the exact user action first: same button, overlay, modal, shortcut, pinned app, and route.
- A backend `200` is not proof that checkout works. The visible click path must be tested.
- Before debugging dev-server behavior, reset known project state: intended ports, stale `public/hot`, and project-owned listeners only.
- After two failed server-start attempts, stop changing ports. Read logs and identify the owner process.
- For "run website", done means URL returns, page loads, asset pipeline works, and the user gets the exact link.
- For "desktop app works", done means the exact desktop shortcut or taskbar pin opens the branded app, not just any Electron process.
- For visual work, provide named screen states and screenshots: closed/open/expanded, empty/long content, mobile/desktop, hover/overlay states, and scroll ownership.
- Do not call a task fixed while an untested entry point remains. Say exactly what was verified and what was not.
- Long tasks need checkpoint updates every 5-10 minutes: verified, unverified, blocker, next actions, and stop condition.

## Skill Gaps

| Skill | Trigger | Must Enforce |
|---|---|---|
| `hke-local-runbook` | "run website", "give me HKE link", Homegrounds, local URL issues | Run doctor/start script, handle stale `public/hot`, verify HTTP 200, report website/Vite/Electron URLs. |
| `hke-electron-startup-guard` | Electron, desktop app, shortcut, pinned app | No nested `npm` on Windows, absolute Node binary, inspect shortcut target/icon/working dir, verify exact entry point. |
| `hke-checkout-regression` | Checkout, cart, basket, payment, order flow | Test visible click path, `/checkout`, order POST, Till `Pay Now`, and build-time guard. |
| `hke-visual-qa` | UI polish, dashboard, till, modal, menu, profile | Require screenshots, overflow checks, console checks, overlay hit-testing, scroll lock, and desktop/mobile viewports. |
| `hke-obsidian-incident-log` | Bug takes more than one debug pass, repeated startup issue, checkout/payment failure | Add cause, misleading checks, fix, prevention checklist, and verification to Obsidian. |
| `hke-payment-hardware-readiness` | Card reader, receipt printer, EPOS, Stripe/Square/SumUp | Do not treat fake card-entry UI as real payment; require provider IDs, terminal flow, failures, idempotency, and printer offline handling. |
| `hke-modal-action-audit` | Modal/drawer/till/admin redesign | No hidden actions, no unreachable dialogs, semantic modal behavior, focus/escape/backdrop, consistent z-index. |
| `hke-build-release-gate` | "fixed", "ready", "ship", build, PR | Run build, relevant PHP tests, local asset checks, route visual QA, and summarize non-fatal warnings. |

## Context To Carry Forward

The core mistake to avoid is solving adjacent technical problems before proving the user-facing path. On HKE, always start from the user's exact action and exact entry point, then move down into routes, server state, and code. The fastest reliable path is: reproduce exact path, isolate process state, patch narrowly, add a regression guard, run build, and log the lesson in Obsidian.

## Follow-Up

- [x] Created five Codex skills: `hke-local-runbook`, `hke-checkout-regression`, `hke-visual-qa`, `hke-electron-startup-guard`, and `hke-obsidian-incident-log`.
- [ ] Add a browser-level regression for the cart checkout button and Till `Pay Now` modal.
- [ ] Add feature tests for till order store/settle permissions and validation.
- [ ] Decide real payment and receipt hardware provider before treating card/receipt UX as production-ready.
