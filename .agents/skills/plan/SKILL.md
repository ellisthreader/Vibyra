---
name: plan
description: Plan, review, execute, and verify broad or multi-step work. Use when the user asks Codex to make a plan, review a plan, implement a large feature, coordinate subagents, improve UI/design with simplicity in mind, or turn a vague goal into concrete steps before editing.
---

# Plan

Use this skill when the task is large enough that a quick edit would risk drift, rework, or visual/architectural clutter.

## Workflow

1. Restate the goal in concrete terms.
2. Read the smallest relevant project memory, matching local skill, and source files before broad exploration.
3. Write a short plan with clear checkpoints. Keep it practical, not ceremonial.
4. Review the plan before editing:
   - Is the core user outcome preserved?
   - Is the implementation smaller than the first obvious version?
   - Are UI surfaces simpler, calmer, and less control-heavy?
   - Are permission, persistence, and validation boundaries explicit?
   - Does a local skill need to be read or updated so future agents follow the same workflow?
5. Implement the plan in scoped steps.
6. Validate with the narrowest useful checks.
7. Update durable memory or local skills when the work creates reusable rules.

## Simplicity Review

Before editing a “big thing,” remove avoidable complexity from the plan:

- Prefer one strong default path with advanced options hidden behind menus or toggles.
- Avoid adding permanent visible controls for rare actions.
- Do not add extra page headers, labels, cards, or explanations unless users need them to act.
- Keep state ownership obvious: local UI state in local UI modules, route/API state in route modules, durable rules in memory notes.
- Keep subagents scoped to independent work only when the user explicitly requests delegation or the active agent rules allow it.

## UI Review

For frontend work, review the plan against the relevant frontend/design skill before editing.

- Make the first screen useful, not explanatory.
- Keep repeated items compact and stable.
- Hide settings until requested.
- Prefer tabs, icon buttons, menus, and subtle status dots over dashboards of controls.
- Verify desktop and narrow screenshots when practical.

For Vibyra marketing, compare the current branch with the public release
metadata before describing the product. If the published tag is newer, inspect
its relevant source with `git show`; preserve the active dirty checkout. Treat
phone client code, a working desktop pairing server, and public store access as
separate claims. See `Vibyra/_ai/Marketing/Marketing Website.md` for ownership
and the browser checks for responsive layouts, interactive states and pricing
failure/retry. Keep plans API-backed rather than inventing fallback prices.

Keep real marketing controls outside scaled product illustrations on narrow
screens. Offer a readable expanded tour when a miniature cannot explain the
workflow. Verify dialog keyboard looping, Escape/backdrop dismissal, restored
focus and page scrolling, including short landscape viewports. Scrollable code
examples must be keyboard focusable. Check text readability visually in addition
to automated contrast checks; the `scripts/marketing/verify-tour.mjs` helper
covers the expanded workspace tour. Native-dialog close assertions should wait
for DOM removal; role locators stop matching before React cleanup completes.

## Completion

End with the concrete files changed, checks run, and any memory/skill updates made. If tests or screenshots were not run, say why.

## Vibyra account integration implementation

Route agent-page connection work through `Vibyra/_ai/Desktop/Agent Integrations.md`
and its setup/evidence runbook. Keep registration presence, completed consent,
useful engine reads and packaged release evidence separate. Refresh-token rotation
must commit even when a later API read fails; test this across HTTP fake resets.
Use the provider's actual mode-specific install URL, not an invented test-mode query.
For Shopify, serialize the installation's single refresh-token owner and bind signed
webhook body identity before trusting routing headers. Include late-delivery tests.
