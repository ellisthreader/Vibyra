---
title: Codex Lessons Learned
type: lessons-index
status: active
updated: 2026-07-16
source: Codex chats
confidence: high
tags:
  - resource/lessons
  - coding-memory
---

# Codex Lessons Learned

Consolidated cross-project lessons. Detailed project incidents remain in their existing folders; this note provides the reusable rule and links to the source.

## Prompt events are not user intentions

- **Problem:** Raw prompt totals were treated as if every event were a separate request or unit of productive work.
- **Symptoms:** One multiline paste becomes many prompts; copied UI labels, slash commands, accidental keys, and terminal output inflate activity totals.
- **Root cause:** The native PTY logger completes a prompt on newline unless bracketed-paste markers keep the text together.
- **Solution:** Label totals as `prompt events`, cluster rapid same-session events, filter commands/noise, and review request-like clusters before drawing conclusions.
- **Why it worked:** The 2026-07-16 corpus contained 374 events but only 281 two-second session clusters; 99 events belonged to nine large paste bursts.
- **Prevention:** Never infer tasks completed, independent ideas, or quality from the raw counter. Keep raw transcripts private and store only redacted synthesis.
- **Related:** [[99 Meta/Prompt Activity Review - 2026-07-16|Prompt Activity Review]], [[01 Projects/Vibyra/Operating Memory/User Prompting Profile - Vibyra Logs|User Prompting Profile]].

## Separate planned, implemented, and verified work

- **Problem:** A handoff described activity without making clear whether the agent only planned it, changed source, or proved the live result.
- **Symptoms:** The user asks what was done, whether the plan was implemented, or reports that the same visible defect remains.
- **Root cause:** Source edits, passing tests, and exact user-facing verification were collapsed into a generic `done` state.
- **Solution:** End every substantial handoff with **State**, **Changed**, **Evidence**, and **Remaining**. Use only Planned, Implemented, Verified, or Blocked as the state.
- **Why it worked:** It makes uncertainty and unfinished validation visible and prevents a terminal lifecycle `completed` marker from being mistaken for product success.
- **Prevention:** For repeated UI/runtime defects, reproduce the exact entry point and settled state, capture fresh evidence, then add a regression.
- **Related:** [[99 Meta/Prompt Activity Review - 2026-07-16|Prompt Activity Review]], visual verification, HKE exact-path incidents.

## Verify workspace identity before touching code

- **Problem:** A folder name looked correct but contained another project's repository.
- **Symptoms:** The wrong site opened, edits did not appear where expected, or ClearDBS rendered RelayClarity.
- **Root cause:** Trusting a lookalike folder without checking cwd, Git remote, branch, server process, and page identity.
- **Solution:** Before edits, run repository/branch/remote checks, identify the process serving the target port, and probe visible page text.
- **Why it worked:** It validates both source identity and runtime identity.
- **Prevention:** Keep one canonical checkout per project and treat generic Desktop copies as suspect.
- **Related:** [[01 Projects/ClearDBS/Incidents/Clear DBS Workspace Misrouting Incident Report|ClearDBS misrouting incident]], [[01 Projects/ClearDBS/Lessons/Work in ClearDBS repo, never the Desktop lookalike folders|ClearDBS workspace rule]], Git, local servers.

## Stale servers can make correct code look broken

- **Problem:** The browser used an old backend, old Vite bundle, or another project on the expected port.
- **Symptoms:** Auth returns the wrong response, UI changes do not appear, `Backend API is unavailable`, or a Laravel page loads without assets.
- **Root cause:** Port reuse, stale processes, `public/hot` pointing at an unavailable Vite URL, or fallback logic choosing the wrong backend.
- **Solution:** Probe health/page identity, inspect owning processes, remove stale `public/hot` only when appropriate, and restart the correct stack.
- **Why it worked:** It aligns browser, frontend, backend, and source tree.
- **Prevention:** Give each concurrent app explicit ports and verify them before claiming success.
- **Related:** [[01 Projects/ClearDBS/Lessons/Run ClearDBS natively, not via Docker Sail|ClearDBS native runbook]], [[01 Projects/Hong Kong Express/HKE Memory|HKE Memory]], Vite, Laravel, Express.

## Windows `localhost` and CORS need deliberate handling

- **Problem:** A local frontend could not call a healthy backend.
- **Symptoms:** `Failed to fetch`, especially from changing Vite/LAN origins.
- **Root cause:** `localhost` resolving to IPv6 while Uvicorn listened on IPv4, plus a CORS allowlist that did not include the active port/origin.
- **Solution:** Normalise local API URLs to `127.0.0.1` and allow the intended local/LAN Vite origin range.
- **Why it worked:** Both address family and origin policy matched the real runtime.
- **Prevention:** Centralise API base discovery and test localhost, 127.0.0.1, and LAN access explicitly.
- **Related:** [[01 Projects/Service Priority AI/Azure Project/13 - Project Operating Memory|Service Priority AI operating memory]], FastAPI, React, CORS.

## Runtime database state is the source of truth

- **Problem:** Seed JSON/assets looked correct while the live menu was empty or showed old images.
- **Symptoms:** `No dishes found`, missing drinks/categories, or generated images not appearing.
- **Root cause:** The live app read database rows, not seed files or public assets directly.
- **Solution:** Inspect the service/repository data path, sync DB image fields, and add a deliberate seed fallback when the database is empty.
- **Why it worked:** The rendered data source, not merely the intended seed source, was corrected.
- **Prevention:** Verify seed, migrations, DB rows, media relations, and the live endpoint together.
- **Related:** [[01 Projects/Hong Kong Express/Lessons/Menu catalog must fall back to seed JSON when DB is empty|Menu seed fallback]], [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB|Menu image sync]], SQLite, Laravel.

## Electron launchers must launch the product contract, not `electron.exe`

- **Problem:** A pinned shortcut opened the stock Electron screen or a stale desktop bridge.
- **Symptoms:** Wrong name/icon, generic Electron UI, terminal contract mismatch, or the app failing after an update.
- **Root cause:** Shortcut pointed directly at Electron, or launcher reused a healthy-but-stale bridge with an older launch contract.
- **Solution:** Point shortcuts to the product launcher, set app identity/icon explicitly, and compare the bridge contract before reuse.
- **Why it worked:** Startup became version-aware and product-owned.
- **Prevention:** Add startup health/contract checks and test desktop shortcut, taskbar pin, cold start, and restart.
- **Related:** [[01 Projects/Vibyra/Memory/Vibyra Desktop Memory|Vibyra Desktop Memory]], [[01 Projects/Vibyra/Desktop/Desktop Shell|Desktop Shell]], Electron, Windows.

## Terminal focus, keyboard ownership, and PTY transport are separate concerns

- **Problem:** Space/input sometimes did nothing, duplicated, or activated terminal chrome.
- **Symptoms:** New terminals could not type spaces, copied text failed, links did not work, or provider prompts behaved inconsistently.
- **Root cause:** Focus race between xterm and surrounding controls, incomplete fallback key handling, and gaps in renderer-to-PTY tests.
- **Solution:** Focus xterm after mount/activation, send printable key data to the PTY only when terminal input owns the event, and add targeted runtime tests.
- **Why it worked:** It fixed keyboard ownership instead of patching individual keys.
- **Prevention:** Test new-terminal focus, Space, paste/copy, composition, repeated keys, links, voice input, and provider startup separately.
- **Related:** [[01 Projects/Vibyra/Desktop/AI Terminals|AI Terminals]], Vibyra Windows bug reviews, xterm, PTY.

## CSS clipping usually belongs to an ancestor

- **Problem:** Dropdowns, phone fields, menus, or modals were cut off despite local z-index changes.
- **Symptoms:** Popover disappears at a section/card boundary or cannot escape a terminal tile.
- **Root cause:** Ancestor `overflow`, stacking context, transforms, or fixed-height container—not the child itself.
- **Solution:** Inspect the full ancestor chain; allow overflow where safe or portal the open menu to `document.body`.
- **Why it worked:** The actual clipping/stacking boundary was removed.
- **Prevention:** Include popover-open states in desktop/mobile screenshots and avoid decorative overflow rules on interactive containers.
- **Related:** RelayClarity demo phone dropdown, Vibyra terminal settings menu, CSS, responsive UI.

## React hooks must not depend on route-level early returns

- **Problem:** Login/dashboard navigation produced a blank page.
- **Symptoms:** React hook-order crash after switching routes.
- **Root cause:** A component returned early for some routes before later hooks ran.
- **Solution:** Keep hook invocation order unconditional and move route rendering below hooks or into child components.
- **Why it worked:** React saw the same hook sequence on every render.
- **Prevention:** Split very large route components and test navigation between every major view.
- **Related:** [[01 Projects/RelayClarity/Architecture|RelayClarity Architecture]], React.

## Animation layout measurements can become stale

- **Problem:** Parallax content disappeared after refresh/tab changes, and voice-confirmation portraits jumped off-screen.
- **Symptoms:** Missing text/effect or an element moving down then back up during state changes.
- **Root cause:** Stale Framer Motion measurements, route lifecycle timing, or `layout/layoutId` being used for state changes that should not reposition the element.
- **Solution:** Recalculate on the relevant lifecycle/resize path and remove layout animation where only opacity/transform feedback is intended.
- **Why it worked:** Animation state matched the current DOM geometry.
- **Prevention:** Test cold load, refresh, back/forward, tab return, resize, and state changes.
- **Related:** [[01 Projects/RelayClarity/Incidents/RelayClarity Home Parallax Incident - 2026-07-09|Home parallax incident]], Framer Motion.

## Interactive hit areas must not overlap navigation

- **Problem:** Clicking the password field sometimes opened Forgot Password.
- **Symptoms:** Input focus triggered an adjacent route/action.
- **Root cause:** Label/anchor positioning or hit area overlapped the input.
- **Solution:** Inspect computed boxes and pointer targets, separate controls structurally, and add a regression test at desktop/mobile widths.
- **Why it worked:** It corrected event geometry rather than suppressing navigation.
- **Prevention:** Test click/tap points across the whole field, not only the centre.
- **Related:** [[01 Projects/RelayClarity/Incidents/RelayClarity Login Password Hit Area Incident - 2026-07-10|Login hit-area incident]], accessibility, auth.

## Visual work is incomplete without rendered verification

- **Problem:** Source edits looked plausible but the live UI remained cluttered, clipped, stale, or inconsistent.
- **Symptoms:** User reports `nothing changed`, `doesn't fit`, or `looks terrible` after a claimed fix.
- **Root cause:** No fresh screenshot, wrong server/cache, or verification at only one viewport/state.
- **Solution:** Run the page, capture target desktop/mobile states, compare to the reference, and check overflow/background continuity/interactions.
- **Why it worked:** Acceptance was based on the product surface rather than source intent.
- **Prevention:** Make screenshot-driven QA the default for UI changes.
- **Related:** [[01 Projects/Vibyra/Operating Memory/User Prompting Profile - Vibyra Logs|User Prompting Profile]], HKE visual QA, RelayClarity audits.

## Third-party scripts and APIs need singleton and cost guards

- **Problem:** Maps/telephony/integration features risked repeated external calls.
- **Symptoms:** Concern about API spam and uncontrolled cost.
- **Root cause:** Component rerenders or polling can reload provider scripts or repeat paid requests.
- **Solution:** Load provider SDKs once, separate internal polling from external calls, cache stable data, and instrument request counts.
- **Why it worked:** Runtime evidence showed one Google Maps script load and no unnecessary geocoding calls during the check.
- **Prevention:** Add rate limits, idempotency, caching, explicit refresh, and usage telemetry.
- **Related:** HKE delivery map, RelayClarity integrations, Google Maps, API cost control.

## AI must hand off when evidence or authority is weak

- **Problem:** An assistant or model could be interpreted as making an official or high-impact decision.
- **Symptoms:** Overconfident DBS advice or council priority output presented as final.
- **Root cause:** Product copy and workflow did not clearly separate recommendation from authority.
- **Solution:** Ground answers, expose uncertainty/evidence, flag risky/low-confidence cases, and keep a named human final decision.
- **Why it worked:** It aligns the product with the real accountability boundary.
- **Prevention:** Preserve advisory-only decisions in architecture notes and tests.
- **Related:** [[01 Projects/Service Priority AI/Azure Project/09 - Decisions|Service Priority AI Decisions]], [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]], Responsible AI.

## Secrets never belong in durable memory or client code

- **Problem:** A chat included an OpenAI API key.
- **Symptoms:** Credential exposure risk in transcripts, notes, examples, or browser code.
- **Root cause:** Pasting live configuration into an AI conversation.
- **Solution:** Redact the value, store keys only in server-side environment configuration, and rotate exposed credentials.
- **Why it worked:** It prevents the memory system from amplifying the exposure.
- **Prevention:** Scan generated notes for credential patterns and never commit `.env` files.
- **Related:** [[99 Meta/Codex Chat Memory Audit - 2026-07-10|Codex Chat Memory Audit]], OpenAI API, security.

## Related indexes

- [[03 Resources/Architecture Decision Register|Architecture Decision Register]]
- [[03 Resources/Development Commands|Development Commands]]
- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[99 Meta/Ellis - Coding Memory|Ellis - Coding Memory]]
