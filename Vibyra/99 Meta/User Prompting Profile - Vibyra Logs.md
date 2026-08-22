---
title: User Prompting Profile - Vibyra Logs
type: profile
scope: core
status: active
source_window: 2026-06-28 to 2026-07-16
updated: 2026-07-16
tags:
  - ai/profile
  - vibyra
  - prompting
  - user-profile
  - ai-second-brain
aliases:
  - User Prompting Profile
  - Ellis Prompting Profile
  - Vibyra Prompt Profile
---

# User Prompting Profile - Vibyra Logs

> [!summary]
> The user is outcome-first, visual, fast-moving, and expects agents to inspect the real project state, implement the fix, verify it, and preserve durable lessons in Obsidian when issues repeat. They often write short, typo-heavy prompts, paste raw UI text or screenshots, and rely on the agent to infer the intended workflow from context.

## Use This Note For

Read this note when an agent needs to understand how the user prompts, what they usually mean, and what response style is most effective.

Use it before:

- broad Vibyra work;
- UI/visual QA work;
- screenshot-led changes;
- local dev server or desktop terminal debugging;
- repeated bug diagnosis;
- Obsidian memory/profile work;
- subagent/team audits;
- any task where the prompt is short, typo-heavy, or emotionally direct.

Do not use this note to stereotype the user or override explicit current instructions. The current user message always wins.

## Source Coverage

Primary prompt corpus:

- `Prompt Transcripts.md` (removed 2026-08-22; backup in `/home/ellis/Desktop/.vault-cleanup-backup-2026-08-22/`)
- 1,781 logged prompts.
- Window: 2026-06-28 to 2026-07-07.
- Main surfaces: Native Terminal and some Terminal Dictation.
- Raw audio is not stored.

Additional sources:

- `C:\Users\Ellis\.vibyra-agent\codex-terminals\terminal-*\history.jsonl`
  - 138 files inspected by subagent.
  - 581 prompt records.
  - Window: 2026-06-28 to 2026-07-07.
- `C:\Users\Ellis\.vibyra-agent\codex-terminals\terminal-*\sessions\YYYY\MM\DD\rollout-*.jsonl`
  - 194 files found, about 1.44 GB total.
  - Sampled for metadata and format only, not fully read.
- `C:\Users\Ellis\.vibyra-agent\terminal-sessions\*\config.json`
  - 13 session configs inspected by subagent.
- `C:\Users\Ellis\.vibyra-agent\terminal-sessions\*\output.log`
  - recent logs keyword-sampled.
- Existing Obsidian Vibyra notes, especially Desktop/App/Backend memory and recent run logs under `01 Projects/Vibyra`.

Coverage caveat:

- This is a strong recent working profile, not a permanent whole-life profile.
- It is based on local Vibyra logs and Obsidian project memory.
- Secrets, tokens, account details, full raw transcripts, phone numbers, and email-like data should not be copied into durable profile notes.

## 2026-07-16 Delta

The full-day follow-up reviewed all 374 events logged through 23:37 Europe/London: 237 under Vibyra and 137 under HKE, across 84 sessions. See [[99 Meta/Prompt Activity Review - 2026-07-16|Prompt Activity Review - 2026-07-16]] for the evidence and project synthesis.

New durable interpretation rules:

- A prompt event is not necessarily an independent user intention. Multiline native-terminal paste, copied UI labels, commands, accidental keys, and terminal output can each create events.
- A transcript outcome marked `completed` means the terminal turn lifecycle closed; it does not prove implementation or verification.
- Repeated correction of the same visible state is evidence that the previous verification was insufficient. Reproduce the exact route, entry point, viewport, and settled state before editing again.
- Always distinguish **Planned**, **Implemented**, **Verified**, and **Blocked** in handoffs. The user should not need to ask which one occurred.
- Under rapid multi-session work, assign one owner per surface and run an integration check against the live worktree before claiming completion.
- Leading numbers, fused words, and missing spaces can be PTY input corruption. Interpret the clear intent and separately diagnose the terminal path.

Today's strongest preference confirmations were: simpler hierarchy, fewer nested boxes, compact copy, stable layouts across state changes, exact rendered verification, and preserving approved designs instead of repeatedly replacing them.

## Prompt Statistics From The Main Transcript

Project clusters:

| Project | Prompt count |
|---|---:|
| HKE | 785 |
| test zoom project / RelayClarity | 606 |
| clear dbs | 153 |
| azure project | 149 |
| vibyra | 69 |
| Global | 19 |

Prompt length:

| Metric | Characters |
|---|---:|
| Minimum | 1 |
| 25th percentile | 15 |
| Median | 53 |
| 75th percentile | 167 |
| Maximum | 3,858 |

Detected intent categories:

| Category | Approx count |
|---|---:|
| Visual review, UI, screenshots, design | 564 |
| Move, remove, redesign, make/change | 467 |
| Run, test, verify, start, live state | 328 |
| Fit, overflow, scroll, gap, overlap | 307 |
| Fix, broken, wrong, error, not working | 251 |
| Frustration or escalation markers | 159 |
| Deep audit, whole app/site, detailed plan | 152 |
| Exact reference matching / "100%" | 133 |
| Desktop, terminal, Electron, Windows | 133 |
| Project-name context markers | 123 |
| Explicit Obsidian/memory requests | 18 |

Frequent imperative words:

| Word | Approx count |
|---|---:|
| make | 252 |
| review | 240 |
| ensure | 158 |
| fix | 123 |
| look | 85 |
| use | 78 |
| go | 77 |
| add | 56 |
| remove | 52 |
| run | 39 |
| find | 37 |

High-signal repeated terms include: `please`, `review`, `fix`, `make`, `ensure`, `screenshot`, `run`, `continue`, `fit`, `scroll`, `professional`, `beautiful`, `better`, `same`, `whole`, `everything`, `deep`, `detailed`, `add to obsidian`.

## High-Level Pattern

The user usually wants finished work, not advice.

Typical loop:

1. User gives a short instruction, screenshot, pasted UI text, or error message.
2. Agent should inspect real state.
3. Agent should implement the fix without over-asking.
4. Agent should run or visually verify.
5. Agent should summarize what changed and where to open it.
6. If the bug repeats, agent should add a durable Obsidian lesson.

The user often prompts in rapid correction loops:

- "review this"
- "fix this"
- "no, this looks terrible"
- "make it fit"
- "remove this"
- "go through the whole app"
- "add this to Obsidian so it never happens again"

Interpret fast, typo-heavy prompts by intent, not spelling.

## Common Prompt Shapes

### 1. Screenshot Or Image Plus Correction

Shape:

```text
'C:\path\to\screenshot.png' review this looks terrible fix completely
```

Meaning:

- Inspect the image.
- Identify the visual issue.
- Modify the real UI or generate the requested asset.
- Verify with a fresh screenshot.

Best response:

- Do not ask the user to restate the issue if the screenshot makes it clear.
- Do not imagine the UI; open the screenshot or run the page.
- Check fit, spacing, overlap, scroll, background continuity, and brand consistency.

### 2. Pasted UI Text Plus "Remove/Redesign/Fix"

Shape:

```text
<large block of visible UI text> remove this completely redesign this
```

Meaning:

- The pasted text identifies the exact UI region.
- The user likely wants less text, fewer panels, clearer hierarchy, or the section removed.

Best response:

- Locate the UI source by visible copy.
- Simplify rather than add another decorative layer.
- Verify the target page visually.

### 3. "Review" Means Inspect And Find The Real Issue

When the user says `review this`, default to code-review/visual-QA behavior:

- inspect the live page, screenshot, logs, PR, CI, or file;
- find defects and risks;
- implement if the prompt implies fixing;
- avoid generic summaries.

### 4. "Fix" Means Implement And Verify

When the user says `fix`, assume they want the repair done now.

Do:

- reproduce or inspect;
- patch the source cause;
- run a relevant test/build/preview;
- report the verification.

Do not:

- stop at a plan;
- ask for permission when the safe next step is obvious;
- patch only symptoms when root cause is discoverable.

### 5. "Deep/Whole/Everything" Means Broad Audit

When the user asks for the whole site/app/repo:

- make an explicit route/source list;
- use subagents if requested;
- run real tools where available;
- create a structured findings plan;
- separate immediate fixes from future work.

### 6. "Add To Obsidian" Means Durable Prevention

When the user asks to add something to Obsidian:

- write a note in the relevant project memory area;
- include cause, fix, prevention, commands, source files, and future-agent rules;
- link it from the project index or memory entry point;
- do not dump raw logs or secrets.

## Preferred Agent Behavior

The user responds best when agents:

- act autonomously after reading the local context;
- check the real app/page/file rather than guessing;
- preserve existing working changes;
- verify visually for UI work;
- give local URLs when a dev server is running;
- use screenshots or browser automation for visual tasks;
- keep designs clean, professional, modern, and less busy;
- reduce text and panels when the user says a page is too much;
- document repeated incidents in Obsidian;
- keep final summaries short and concrete.

## Things That Frustrate The User

Frustration usually comes from repeated visible mismatch, not from disagreement.

Common triggers:

- wrong repo/folder/server is running;
- agent says something is done but live UI does not show it;
- UI becomes more cluttered while trying to improve it;
- added scrolling where the user wanted one-screen fit;
- text, cards, dropdowns, or modals are cut off;
- image backgrounds have hard edges, grey bottoms, or bad blending;
- generated images look generic or do not match the brand/page;
- previous better design is lost;
- agent ignores screenshot/reference;
- agent stops at a plan when implementation was expected;
- Obsidian lessons are not saved after repeated bugs.

Frustration markers in prompts:

- repeated `no`;
- `terrible`;
- `nothing is actually working`;
- `I don't see a difference`;
- `fix this now`;
- `again`;
- all-caps project correction;
- "add this to Obsidian so it never happens again".

When these appear:

- slow down enough to verify the actual state;
- state the concrete root cause if known;
- fix and re-check;
- avoid defensive explanations.

## Design Preferences

The user tends to prefer:

- simple, clean, modern, professional UI;
- fewer cards and less explanatory text;
- strong visual hierarchy;
- consistent backgrounds across page sections;
- no obvious scroll/fit problems;
- dashboard surfaces that are useful and scannable, not decorative;
- reference-image matching, adapted to the user's logo and colour scheme;
- generated images that blend into the page rather than looking pasted on;
- mobile and desktop screenshots before calling visual work done.

Common design instructions translated:

| User wording | Agent interpretation |
|---|---|
| "looks terrible" | Reassess layout, hierarchy, spacing, background, and fit from scratch. |
| "make it look 100% like this" | Use reference as composition target, but preserve brand colours/logo unless told otherwise. |
| "too much text" | Reduce copy, group content, use shorter labels, remove repeated explanation. |
| "doesn't fit" | Check viewport dimensions, text wrapping, overflow, sticky/fixed elements, and mobile layout. |
| "no grey at bottom" | Background continuity problem; inspect full-page screenshot and section boundaries. |
| "blend perfectly" | Avoid hard image edges; use matching background, masks, gradients only if visually seamless. |
| "review whole page" | Inspect full scroll path, not only first viewport. |

## Common Technical Problem Areas

### Local Dev And Project Routing

Repeated issues:

- wrong checkout opened;
- wrong local server running;
- frontend points to unavailable backend;
- stale ports;
- preview shows old code;
- Electron/desktop helper opens visible terminal windows;
- terminal/provider identity mismatch.

Agent rule:

- Always confirm cwd, project path, branch, running ports, and URL before claiming the app is fixed.

### UI Fit And Visual QA

Repeated issues:

- clipped dropdowns;
- boxes cut off;
- too much scroll;
- background gaps;
- overlapping cards;
- mobile layout overflow;
- unreadable or cluttered dashboards.

Agent rule:

- For UI changes, check screenshots at relevant desktop/mobile sizes before final.

### Checkout/Payment/Order Flows

The user repeatedly asks for real workflow diagnosis, especially around checkout/till/order/payment style flows.

Agent rule:

- Do not rely only on static inspection. Reproduce the flow where possible and verify state transitions.

### Agent/Terminal Reliability

Repeated issues:

- native provider CLI startup failures;
- provider/model identity mismatch;
- terminal input/output problems;
- stale worker/session state;
- billing/credit confusion;
- transcript or prompt routing failure.

Agent rule:

- Verify the exact runtime/model, transport, credentials, billing state, PTY transcript, and visible UI separately.

### Obsidian Memory Drift

The user wants repeated fixes to become durable memory.

Agent rule:

- If a bug takes more than one pass, crosses sessions, or the user explicitly asks, add a note with prevention rules.

## Future-Agent Operating Rules

1. Start by confirming the correct project, cwd, branch, and server/URL.
2. Read the relevant project memory before source, but only the smallest useful note set.
3. For visual tasks, inspect the screenshot or live page before editing.
4. Treat `review` as inspect-and-find-defects, not summarize.
5. Treat `fix` as implement-and-verify, not propose.
6. Keep UI simpler than the first instinct.
7. Preserve working behavior and prior good design versions.
8. When a screenshot is supplied, compare against the actual rendered page after edits.
9. When another agent failed midway, inspect the worktree and continue from actual state.
10. For dev-stack issues, check ports, stale processes, backend availability, and API base URL.
11. For broad audits, use subagents only when the user asks or when explicitly authorized.
12. Do not copy raw sensitive prompt logs into durable notes.
13. Final answers should say what changed, what was verified, and where to open it.

## Prompt Translation Cheat Sheet

| User says | Future agent should do |
|---|---|
| "give me link" | Start or locate the running app and provide the local URL. |
| "review this" | Inspect the exact artifact and list/fix concrete issues. |
| "fix" | Patch and verify. |
| "go through whole app/site" | Make a route/source inventory, audit systematically, and report prioritized findings. |
| "use subagents" | Spawn bounded parallel agents by source area or module, then synthesize. |
| "add to obsidian" | Create/update a durable project note and backlink it from the memory index. |
| "nothing changed" | Check wrong server/path/cache/stale build before editing more. |
| "looks terrible" | Run visual QA, simplify, and compare screenshots. |
| "doesn't fit" | Check overflow, viewport, scroll, dynamic text, and fixed/sticky elements. |
| "100% like this" | Match layout/composition from reference while preserving brand constraints. |

## What To Avoid

- Do not answer with generic reassurance.
- Do not write long theory before inspecting the app.
- Do not say "done" unless it was verified.
- Do not make visual work more complex when the user asked for polish.
- Do not lose existing user changes.
- Do not assume a local URL is correct without probing it.
- Do not dump raw transcripts into Obsidian profile notes.
- Do not make the user restate obvious screenshot issues.

## Best Final Response Shape

For implementation tasks:

```text
Done. I changed <specific thing> in <file/area>. Verified with <command/screenshot/URL>. The app is at <URL>.
```

For audits:

```text
I found <top issue>, <second issue>, and <third issue>. The detailed plan is in <note/file>. The main priority is <next action>.
```

For Obsidian memory work:

```text
Added the note at <path> and linked it from <index/memory note>.
```

## Related

- [[01 Projects/Vibyra/Vibyra AI Core Index]]
- [[01 Projects/Vibyra/Memory/Context Map]]
- [[01 Projects/Vibyra/Operating Memory/Memory Protocol]]
- [[01 Projects/Vibyra/Memory/Vibyra Desktop Memory]]
- [[01 Projects/Vibyra/Runs/Two Week Chat Context Review - 2026-07-07]]
- [[99 Meta/Prompt Activity Review - 2026-07-16]]
- Raw prompt transcript — removed 2026-08-22; backup in `/home/ellis/Desktop/.vault-cleanup-backup-2026-08-22/`
