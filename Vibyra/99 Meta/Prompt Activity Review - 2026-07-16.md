---
title: Prompt Activity Review - 2026-07-16
type: prompt-audit
status: complete
date: 2026-07-16
updated: 2026-07-16
source_window: 2026-07-16 Europe/London through 23:37
source_events: 374
confidence: high
tags:
  - audit/prompting
  - coding-memory
  - vibyra
  - hke
---

# Prompt Activity Review - 2026-07-16

> [!summary]
> Vibyra recorded **374 prompt events** today: 237 under Vibyra and 137 under HKE. The day was dominated by visual simplification and exact-state correction, with terminal reliability and desktop consistency driving Vibyra, and customer-profile, order, address/map, allergen, and checkout work driving HKE. The raw count is not 374 independent tasks: the logger also captured paste fragments, UI copy, commands, accidental keys, and terminal text.

## Scope and evidence rules

- Reviewed every prompt event in `Prompt Transcripts.md` (removed 2026-08-22; backup in `/home/ellis/Desktop/.vault-cleanup-backup-2026-08-22/`) from 00:00 Europe/London through the audit request at 23:37.
- Coverage: 374 events, 84 terminal sessions, 12 named terminals, 257 Native Terminal events, and 117 Terminal Dictation events.
- The visible count had been 370; four more events were appended before the audit prompt was recorded, so 374 is the frozen source count for this review.
- Raw prompt text was analysed but not copied into durable memory. Personal details, paths, terminal output, and repeated UI text remain only in the source transcript.
- A transcript `Outcome: completed` means the terminal turn closed after a busy-to-ready transition or output idle period. It does **not** prove the requested implementation was correct, tested, or accepted.
- Project labels identify the terminal's selected project, not necessarily every project named inside a prompt. Cross-project references must be interpreted from the request itself.

## Count quality

| Signal | Count | Meaning |
|---|---:|---|
| Raw prompt events | 374 | What Productivity currently counts |
| Two-second session clusters | 281 | Better approximation of separate submissions |
| Events inside 9 large paste bursts | 99 | Mostly pasted UI copy or split multiline input |
| Request-like events | 229 | Heuristic; still not a completed-task count |
| UI-text fragments | 80 | Labels or copied page content logged as prompts |
| Summary requests | 17 | User repeatedly needed clearer handoff status |
| Continue/resume prompts | 14 | Work was often recovered across sessions |
| Accidental/very short input | 14 | Examples include a number, quote, or test text |
| Terminal-output noise | 10 | Tool/output text was submitted back as input |
| Commands | 8 | `/fast`, `/usage`, `/status`, `/model`, or `/goal` |

The main inflation source is the native PTY logger: a newline completes a prompt unless the input arrives inside bracketed-paste markers. Multiline text arriving without those markers becomes several prompt events.

## Common patterns

The following counts overlap and indicate emphasis rather than exclusive categories:

| Pattern | Events | Interpretation |
|---|---:|---|
| `review` | 91 | Inspect the real state and find the mismatch |
| Visual/design language | 76 | Layout, modal, image, icon, colour, and polish work |
| Negative or repeat signal | 47 | `still`, `again`, `broken`, `bad`, freeze, glitch, or error |
| Simplification | 41 | Less copy, fewer boxes, tighter hierarchy |
| Positive feedback | 35 | Useful approval signals worth preserving as references |
| Plan requests | 29 | Broad changes were expected to start with scope and checkpoints |
| Fix requests | 29 | Implementation and verification were expected now |
| Implementation wording | 20 | Plans often transitioned directly into execution |
| Subagent requests | 16 | Parallel review was preferred for broad or repeated problems |
| Test/verify/accuracy wording | 16 | The user cares strongly about proof and live-state accuracy |
| Preserve/safety wording | 13 | Existing behavior must not regress during redesign/refactor |

## What worked well

- **Strong product judgment:** feedback consistently moved both products toward simpler hierarchy, less copy, fewer nested boxes, and clearer primary actions.
- **Visible acceptance language:** positive feedback identified reusable reference states, including Vibyra's cobalt model imagery, the transparent Progress styling, compact modals, and HKE's cleaner Orders layout.
- **Safety awareness:** broad redesign and refactor requests repeatedly said to preserve existing behavior and use tests or bounded agents.
- **Root-cause pressure:** repeated prompts challenged superficial fixes for terminal scroll position, sidebar width, Google Maps readiness, missing-space input, and report visibility.
- **Memory discipline:** the user explicitly requested that good refactoring and recurring bugs be recorded so later agents do not rediscover them.
- **Cost and privacy awareness:** prompts called out Google API request limits and requested redaction/encryption for terminal bug reports.

## Friction and mistakes to prevent

### Event logging is not intent logging

Pasted UI labels, multiline text, accidental keys, and terminal transcript fragments inflate prompt and belt statistics. Future analytics must show `prompt events` and must not present them as tasks completed, independent ideas, or productivity quality.

### Repeated visual corrections reveal a verification gap

Several issues returned after being described as fixed:

- terminal chats opening at the top or visibly auto-scrolling to the bottom;
- the terminal companion/sidebar changing width between tabs;
- Google Maps showing a false failure or wrong location;
- model icons not appearing and duplicate model rows remaining;
- a grey Settings footer appearing only on some tabs;
- Report a bug not being visible where the user was told to test it.

The lesson is not to add reassurance. Reproduce the exact entry point and state, capture the settled render, then add a regression around that state.

### Plan, implementation, and verification were blurred

The user repeatedly asked for summaries and explicitly asked whether work was a plan or an implementation. Every handoff should label the state as **Planned**, **Implemented**, **Verified**, or **Blocked**, name the exact surface, and list the proof used.

### Parallel work increased coordination risk

Eighty-four sessions and repeated overlapping edits to terminals, Settings, model menus, and HKE profile surfaces create a high risk of stale screenshots, conflicting CSS, duplicated work, and one agent undoing another. Broad multi-agent work needs one surface owner, explicit file boundaries, and a final integration pass against the live worktree.

### Prompt corruption is a product signal

Leading `2` characters, missing spaces, fused words, and pasted terminal output recur most heavily in the later native-terminal prompts. Agents should interpret obvious intent, but Vibyra should treat these as evidence for the existing PTY input/focus/reconnect investigation rather than user writing quality.

### Broad guarantees need measurable gates

Phrases such as `whole app`, `100%`, `absolute`, and `do not stop` express importance but are not acceptance criteria. Agents should translate them into a route/state matrix, tests, screenshots, performance measurements, and explicit exclusions before editing.

### External references require adaptation

Requests to copy Deliveroo or another project's UI mean reuse the interaction pattern and information hierarchy, adapted to the project's brand and data. Do not reproduce protected assets or create a misleading one-to-one clone.

### HKE factual and safety boundaries need care

- Nutrition, ingredient, and allergen values must come from restaurant recipes and supplier labels. AI research or assumed portion sizes may support clearly labelled drafts, never verified legal or safety claims.
- Saved allergen preferences are warnings, not proof that a dish is safe from traces or cross-contact.
- Cheapest-model live chat still needs grounded answers, escalation, cost limits, and clear restaurant contact paths.
- Address/map work must minimize external API calls and use canonical saved postal data.

## Project synthesis

### Vibyra

Today's Vibyra prompts concentrated on five connected areas:

1. Terminal reliability: bottom anchoring, tab-return behavior, reconnect delay, black flashes, missing spaces, freezes, and performance.
2. Cross-surface design: Graphite + Cobalt branding, light-mode completeness, V logo replacement, and desktop/Electron identity.
3. Terminal and Settings simplification: stable companion width, fewer boxes, compact pairing, consistent Settings tabs, billing, and Progress.
4. Model presentation: unique OpenAI/Claude/Gemini artwork, visible custom icons, commonly used models first, and no duplicate or image-less rows.
5. Engineering discipline: under-200-line organization, performance measurement, agentic project memory, and a privacy-preserving local bug-report workflow.

The highest unresolved product signal is terminal trust: the user should never need to wonder whether input, scroll position, reconnection, or a claimed fix is reliable.

### Hong Kong Express

Today's HKE prompts show active development, not maintenance-only work:

1. Profile and account: compact navigation, editable personal details, payment methods, password/2FA, and whole-site language state.
2. Orders: delivery-versus-collection timelines, compact order cards, empty/search states, completed status, and professional PDF receipts.
3. Saved addresses: real Google Maps, canonical address-to-map resolution, entrance-pin movement, compact address cards, and strict API-call controls.
4. Allergens and nutrition: simpler discovery, saved preferences, menu warnings, and a clearer information hierarchy, subject to the factual-safety boundary above.
5. Checkout and basket: shorter step content, less scrolling, clearer delivery state, and a professional one-screen flow.
6. Help/live chat and imagery: a more human support experience, RelayClarity attribution where appropriate, and consistent food/empty-state assets.

The strongest completed evidence is in the linked 2026-07-16 HKE incident and lesson notes. Prompts alone do not establish completion for the remaining UI requests.

## Better prompt and agent contract

For high-risk or repeated work, use this compact structure:

```text
Target: exact project, route/page, terminal, and state
Observed: what is visibly wrong now
Outcome: what should be true instead
Boundary: diagnose only, plan only, or implement; behavior that must remain
Evidence: exact test, interaction, screenshot sizes, and live entry point
```

Agents should respond with:

```text
State: Planned | Implemented | Verified | Blocked
Changed: exact surface and source ownership
Evidence: tests plus the exact rendered/runtime path
Remaining: only unresolved or unverified items
```

## Durable priorities from today

1. Finish the Vibyra terminal input, scroll-anchor, reconnect, and session-restoration reliability work with exact-state regressions.
2. Treat prompt analytics as noisy event telemetry; improve clustering/filtering before using counts for progression or productivity conclusions.
3. Consolidate overlapping Vibyra Settings, theme, model-menu, and terminal changes before more broad redesign work.
4. Keep HKE's active customer-journey work tied to exact routes and rendered desktop/mobile verification.
5. Require restaurant/supplier verification for HKE allergen, ingredient, and nutrition data.
6. Reconcile the very large dirty worktrees into intentional commits after the current live-state checks pass.

## Related

- [[01 Projects/Vibyra/Operating Memory/User Prompting Profile - Vibyra Logs|User Prompting Profile]]
- [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]]
- [[03 Resources/Codex Lessons Learned|Codex Lessons Learned]]
- [[01 Projects/Vibyra/Vibyra|Vibyra]]
- [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]]
- [[01 Projects/Hong Kong Express/Incidents/HKE Saved Addresses Google Map False Failure - 2026-07-16|HKE Google Maps incident]]
- [[01 Projects/Hong Kong Express/Incidents/HKE Saved Address Entrance Pin Discoverability - 2026-07-16|HKE entrance-pin incident]]
- [[01 Projects/Hong Kong Express/Lessons/Profile security and language state must share the live account context|HKE profile state lesson]]
