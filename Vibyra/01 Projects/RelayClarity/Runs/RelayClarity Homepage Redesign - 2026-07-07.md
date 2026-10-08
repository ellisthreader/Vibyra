---
tags: [relayclarity, frontend, design]
date: 2026-07-07
related: "[[RelayClarity]]"
---

# RelayClarity Homepage Redesign — 2026-07-07

Session log of the homepage overhaul done with Claude Code.

## 1. Parallax workflow timeline (replaces the 3 workflow cards)

The old "Business brief / Customer questions / Conversations" card row (which rose in at the end of the pinned *Build. Test. Launch.* scene) was replaced with a dedicated parallax scroll timeline section (`#workflow-timeline`):

- **Left:** sticky image stage — each step's screenshot crossfades in (blur + tilt + vertical slide) with a subtle parallax drift.
- **Middle:** a grey rail whose blue→teal gradient fill grows *exactly* in step with the viewport centre (measured to <1px via CDP).
- **Right:** three steps, each ~a viewport tall — small grey number (`01`), big bold title, small subtext. The step nearest the viewport centre is fully lit; others are dimmed. Active step is picked by measuring which text block is closest to the viewport centre (not raw scroll fractions), so image/text/line never desync.
- Sections are `background: transparent` so the continuous homepage grid background shows through (the home page paints one grid on `main`; opaque section backgrounds break it).
- Mobile / reduced-motion: degrades to a simple left-rail list with inline images, line fully filled.

Key code: `WorkflowTimelineSection` in `src/main.tsx` (framer-motion `useScroll` targeting the grid with `["start center", "end center"]`), CSS block `WORKFLOW TIMELINE` at the end of `src/styles.css`.

Also: launch video now only drifts 8vh (was 112vh) at the end of the pinned scene, which closed the big gap before the timeline.

## 2. Compliance & Security section (`#security`)

New bento trust section between Customer stories and FAQs:

- **Header:** "Compliance & Security" — fully compliant with HIPAA, SOC 2 Type II, GDPR.
- **Feature card (2-col):** "Certified to the highest global standards" — HIPAA / SOC 2 TYPE II / GDPR pill badges with periodic light sheen, plus a shield with pulsing radar rings.
- **SSO:** provider tiles (Okta, Entra ID, Google, SAML) that glow one after another.
- **Personal Info Redaction:** live mini-transcript where phone/card/email get swept by dark redaction bars (staggered, looping).
- **End-to-End Encryption:** sentence blurs/flips into hex ciphertext and back (AES-256 / TLS 1.3 copy).
- **Access & Audit Logs:** endlessly scrolling, edge-masked audit ticker.
- All cards: frosted glass over the page grid, per-card accent colour, hover lift + accent glow, staggered blur-to-sharp scroll reveals. Everything respects `prefers-reduced-motion` (redaction bars stay covering data — fail-safe).

The four capability cards (Low Latency, Ultra-Realistic Voice, Turn Taking, Human Handoff) were restyled to the same glass treatment so both sections read as one system. Footer "Security" link now points to `#security`.

## Gotchas / notes

- Homepage background = one continuous grid painted on `.site-shell > main` (~line 16722 of `styles.css`); marketing sections must stay transparent.
- Verification loop: headless Chrome via CDP (`ws` from node_modules) → scroll to positions → screenshot; scripts live in the Claude scratchpad.
- Two Claude sessions were editing this repo simultaneously (dev server ports shuffled 5178 → 5174; a separate session added the capability-cards section).

## 3. Encoding / mojibake fix

On 2026-07-07, the homepage showed mojibake in many places, especially the capability card copy:

```text
Context moves with the call â€” nobody repeats themselves.
```

Root cause: `src/main.tsx` contained UTF-8 punctuation that had been stored as Windows-1252-style mojibake. Affected sequences included `â€”`, `Â·`, `â€¢`, `â€¦`, `â€º`, and related UI symbol encodings.

Fix applied:

- Normalized the affected runs in `src/main.tsx` back to intended punctuation, including em dashes, middle dots, bullets, ellipses, chevrons, and UI symbols.
- Confirmed the target line now reads: `Context moves with the call — nobody repeats themselves.`
- Rebuilt with `npm run build`.
- Scanned `src`, `public`, and built `dist` text assets for mojibake-like sequences; none found.
- Verified the running Vite server on `http://127.0.0.1:5174/` serves `/src/main.tsx` as UTF-8 cleanly.

Prevention:

- If `â`, `Â`, `Ã`, or `Ï` appear before non-ASCII characters in source or notes, treat it as an encoding regression, not copy.
- Verify with a UTF-8-aware script or build output; PowerShell web/text output can display false mojibake if it decodes a response with the wrong code page.
