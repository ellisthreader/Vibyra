---
title: Vibyra Code Organization and Refactoring Standard
tags:
  - vibyra
  - refactoring
  - code-quality
aliases:
  - Vibyra Code Cleanup Standard
---

# Vibyra Code Organization and Refactoring Standard

Use this for cleanup, organization, optimization, and source-line work across
the Expo app, Laravel backend, marketing website, and Tauri desktop app.

> [!important] Core rule
> First-party source files must be 200 lines or fewer. Exclude generated,
> vendor, cache, build, browser-profile, and temporary files. A refactor is not
> complete until every file in the agreed scope passes the line gate.

## How New Code Should Be Formulated

- Give each file one clear responsibility and a domain-specific name.
- Keep public entry files small and stable; they coordinate or re-export while focused sibling modules implement behavior.
- Preserve imports, exports, classes, methods, routes, payloads, responses, markup, class names, and CSS order unless change is authorized.
- Use TypeScript types for API contracts and feature inputs. Keep local types near the feature and shared domain types in focused type modules.
- Use React context only for genuinely shared state or behavior, not merely to avoid a few explicit parameters.
- Replace parameter sprawl with a typed options/dependency object when it improves call-site clarity; keep dependencies visible.
- Keep controllers, hooks, components, and tests as coordinators. Extract validation, normalization, transport, state transitions, presentation, and errors.
- Optimize measured hot paths and duplicated work. Splitting files improves organization but does not itself prove runtime optimization.

## Proven Cleanup Patterns

| Situation | Preferred pattern | Good Vibyra example |
| --- | --- | --- |
| Stable PHP endpoint trait is oversized | Keep the original trait as a compatibility facade and compose responsibility-named traits | `CodexResponsesEndpoint.php` delegates request handling, normalization, model selection, and errors to `CodexResponses*.php` |
| Provider compatibility code mixes concerns | Separate transport, payload translation, and response conversion | `CodexChatCompletionsCompatibility.php` composes `CodexChatTransport`, `CodexChatPayloads`, and `CodexChatResponse` |
| Route family mixes dispatch and response logic | Separate routes, dispatch, responses, and errors | `NativeTerminalEndpoint.php` composes focused `NativeTerminal*.php` traits |
| API utility owns types, normalization, and calls | Retain a stable barrel and split contracts, normalization, and endpoint families | `src/utils/communityApi.ts` re-exports focused community API modules |
| React section is oversized | Keep a small entry component and extract meaningful visual or behavioral sections | Marketing `Hero.jsx` delegates the beam, terminal, stage showcase, and scroll video |
| Stylesheet owns unrelated sections | Retain one ordered CSS entrypoint and import responsibility-based sheets | `backend/resources/css/marketing.css` preserves one compiled CSS asset |
| PHPUnit class is too large | Preserve the concrete class and lifecycle; group cases in focused traits | Auth, chat, stream, and billing test facades compose traits under `tests/Feature/Concerns/NextTen/` |

## Safe Refactor Workflow

1. Freeze the exact ranked source scope and capture test, build, typecheck, route, output-size, and UI baselines.
2. Classify responsibilities; never split at arbitrary line numbers.
3. Extract one responsibility at a time while keeping the public facade stable.
4. Compare public exports or PHP method inventories with the original.
5. Audit runtime return objects as well as types; object spread can accidentally expose internal fields.
6. Run focused checks, then broader checks appropriate to the surface.
7. Run the scoped 200-line gate with every extracted descendant included.
8. Report unrelated failures separately; do not absorb them into organization-only work.
9. Update the smallest Obsidian ownership notes before finishing.

## Proving A Stylesheet Reorganization Is Safe

Splitting or merging CSS cannot be validated by tests — nothing imports a rule.
Two mechanical proofs replace eyeballing, and both were used for the 2026-08-22
desktop re-cut:

1. **Cascade snapshot.** Concatenate every sheet in `main.tsx` import order,
   strip comments and whitespace, and hash the resulting rule stream. A pure
   reorganization must leave the hash unchanged — same rules, same order, so the
   same rendering. Comment and file-boundary edits are invisible to it by design.
2. **Effective-cascade map.** Record the winning value for every
   `(at-rule context, selector, property)`. Use this when the rule set *does*
   change: deleting a declaration that loses to an identical selector later in
   the cascade cannot move any winner, so an unchanged map proves unchanged
   rendering.

Drive the re-cut from a manifest that asserts the new files exactly tile the old
ones in reading order. That makes losing or reordering a line structurally
impossible, so the hash is a second, independent check rather than the only one.

Two traps this caught: a class only ever built dynamically
(`` `adot--${state}` ``, `"preview-device--" + kind`) is *not* dead, and a class
that appears only inside `:not()` is a live rule's guard — deleting it deletes
live styling.

## Measuring Before Optimizing

Line counts and file splits are organization, not optimization. The 2026-08-22
desktop pass measured first and found the opposite of the guess:

- The Rust PTY path (`SessionOutput::push`/`drain`, 64 MiB of ANSI-heavy agent
  output) runs at ~1.4 GB/s, 0.71 ns/byte. Real agents emit single-digit MB/s,
  so it is ~100x faster than it needs to be; optimizing it would be waste.
- The real cost was the startup JS chunk at 4,703 kB, of which 3,688 kB was one
  base64-inlined MP4 and 114 kB an xterm addon most machines never use.
  Code-splitting both took it to 901 kB (-81%; gzip 3,060 -> 252 kB).

Attribute bundle size from a real sourcemap (`vite build --sourcemap` into a
throwaway outDir, then group the map's `sourcesContent` by module) rather than
guessing from `node_modules` sizes. Benchmarks belong in a scratch harness, not
the repo: a perf module added to `vibyra-core` breaks `cargo fmt --check`.

## Validation Standard

- Cross-codebase scope: `node scripts/check-source-lines.mjs --scope <manifest>`
- Informational hierarchy: `node scripts/check-source-lines.mjs --hierarchy --top 50`
- TypeScript: `npm run typecheck`
- Laravel/PHP: `php -l <file>`, focused feature tests, and route boot/list checks
- JavaScript: focused `node --test` and `node --check`
- Frontend-preserving work: production build, compiled asset count/size comparison, and screenshots when visual output could change
- Desktop hard gate: `node scripts/check-desktop-lines.mjs`

The July 2026 next-ten cleanup is the reference batch: 10 files of 294-396
lines became small stable facades; all 47 scoped files passed the 200-line gate.
The focused backend suite passed 66 tests/342 assertions, community tests and
typechecking passed, and marketing CSS stayed exactly 45.07 kB/9.13 kB gzip.

## Avoid

- Arbitrary `part1`, `part2`, or generic helper modules when a responsibility name is available.
- Moving code without preserving export, reflection, route, or test-filter contracts.
- Context that hides dependencies or creates broad rerender ownership.
- Declaring optimization complete from line counts alone.
- Trusting passing-looking output without checking the exit code.
- Reformatting or redesigning frontend code during organization-only work.
- Reverting unrelated work in a dirty working tree.

Related: [[Memory Protocol]], [[Project Context]], [[Product Surfaces]],
[[Backend/Chat And Cost Controls]], [[Backend/Community Publishing]], [[Runbook]].
