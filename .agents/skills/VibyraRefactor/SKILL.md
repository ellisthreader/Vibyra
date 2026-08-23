---
name: vibyra-refactor
description: Safely refactor and optimize Vibyra code when files are too long, messy, over-parameterized, weakly typed, not using appropriate context/hooks/modules, or generally unorganized. Use when asked to clean up code, enforce a source-file line limit, split oversized files, reduce parameter sprawl, add focused types/contexts/hooks/components, or verify that behavior still works after a refactor.
metadata:
  short-description: Safe refactors and source line gates
---

# VibyraRefactor

Use this skill for structural cleanup and optimization, especially after the user points out long files, messy organization, too many parameters, missing types, missing contexts/hooks, or previous overconfident refactor claims.

## Non-Negotiables

- Do not say the refactor is complete until the final source line gate has been run and returned clean.
- Do not trust "tests look green"; verify process exit codes.
- Do not leave empty placeholder test classes/files that make runners warn or exit non-zero.
- Do not revert unrelated user changes in the working tree.
- Keep behavior stable unless the user explicitly asks for behavior changes.
- Default source line limit is 250 lines unless the repo or user gives a stricter limit.
- Vibyra mobile uses the repo-wide hard 200-line limit. Scope `App.tsx` and all
  first-party code under `src/`, including tests and platform variants; do not
  silently exclude test source from a "whole mobile codebase" claim.
- Vibyra Desktop (Tauri) uses a hard 200-line first-party gate. Run
  `node scripts/check-desktop-lines.mjs`; do not replace it with an ad hoc count.

## First Pass

1. Read repo instructions and relevant Vibyra memory before broad exploration.
2. Check current offenders before editing:

```bash
rg --files src backend/app backend/tests desktop-tauri/src -g '*.{ts,tsx,js,jsx,mjs,cjs,php,css,html}' \
  | xargs wc -l \
  | awk '$2 != "total" && $1 > 250 {print}' \
  | sort -nr
```

3. If doing a broader repo gate, exclude generated/cache/temp/vendor folders:

```bash
rg --files -g '*.{ts,tsx,js,jsx,mjs,cjs,php,css,html}' \
  -g '!node_modules/**' -g '!.git/**' -g '!.expo/**' -g '!.vibyra-agent/**' \
  -g '!backend/vendor/**' -g '!backend/storage/**' -g '!backend/bootstrap/cache/**' -g '!tmp/**' \
  | xargs wc -l \
  | awk '$2 != "total" && $1 > 250 {print}' \
  | sort -nr
```

4. Inspect the largest offenders and classify each one by responsibility, not by arbitrary chunks.
5. A simple static import graph is only a dead-code candidate list in Expo.
   Verify `.native` / `.web` resolution, dynamic assets, deep links, and tests
   before deleting an apparently unreachable mobile module.

## Refactor Patterns

- Large hooks: keep the original hook as coordinator; extract focused action factories or hooks such as tool actions, command approval flows, reply handlers, predicates, message updates, or mode decisions.
- Large components: move header helpers, derived state builders, modal bodies, repeated cards, and capability checks into feature-local helpers/components.
- Large API utilities: split request basics, reachability, streaming/SSE parsing, payload types, and error helpers.
- Large style maps: split by screen/section/state, then re-export or merge to preserve existing style names.
- Ordered mobile style cascades: before renaming or regrouping sources, fixture
  every resolved key, winning source, dark value, light transform, and themed
  Proxy behavior. Keep an explicit ordered source registry, and preserve
  duplicate definitions until a separately reviewed visual change resolves
  them deliberately.
- Backend controller traits: split by real behavior such as validation, attachments, provider payloads, preview extraction, streaming response handling, storage, ranking, and payload shaping.
- When a PHP class or trait has stable reflection, constructor, route-composition,
  or PHPUnit-filter contracts, keep the original type as a thin facade and
  compose responsibility-named traits. Keep shared properties/constants only
  on the facade and verify framework boot, because `php -l` does not detect
  composed-trait collisions.
- Tests: prefer thin original concrete test classes plus focused traits when
  class and method filters must remain stable; keep database/setup lifecycle on
  the concrete class and avoid support filenames ending in `Test.php`.
- Prefer named behavior modules over generic helper dumps.

## Parameter And Type Cleanup

- If a function has many parameters, introduce a typed options/dependency object only when it improves call-site clarity.
- Put shared domain types in the existing domain/type files; put feature-local types near the feature.
- For React code, prefer context/hooks when state or behavior is shared across a feature; avoid prop chains that only shuttle data through unrelated components.
- Keep dependency objects explicit. Avoid hiding large mutable app state inside anonymous "helpers" where behavior becomes harder to audit.

## Validation

Run the checks that match the touched surfaces:

- TypeScript: `npm run typecheck`
- If TypeScript unexpectedly scans generated browser profiles or temporary
  artifacts, fix `tsconfig.json` exclusions for `tmp`, caches, and vendor
  directories instead of accepting a hanging check.
- Desktop tests: `npm --prefix desktop-tauri test` or the relevant test file
- JS/MJS syntax: `node --check <file>`
- PHP syntax: `php -l <file>`
- Backend focused tests: prefer `./vendor/bin/phpunit --filter '<pattern>'` when Artisan reports warnings unclearly
- Final line gate across agreed source scope
- For cross-codebase refactor batches, use
  `node scripts/check-source-lines.mjs --scope <manifest>` for enforcement and
  `node scripts/check-source-lines.mjs --hierarchy --top 50` for the next
  informational hierarchy. Do not infer the scope from a dirty Git diff.
- For the compact mobile code-length table, run
  `node scripts/check-source-lines.mjs --summary --scope scripts/source-scopes/mobile.json --limit 200`.
  Use its canonical physical-line totals rather than shell-specific counts, and
  keep application source separate from tests/test support in the report.
- Vibyra Desktop final gate: `node scripts/check-desktop-lines.mjs`

If a runner prints passing assertions but exits non-zero, investigate. Common causes are empty test classes, warnings, deprecations, or hidden boot errors.

## Final Response Standard

Report only after:

- The final line gate is clean.
- Tests/typecheck/syntax checks passed with clean exit codes, or failures are clearly named.
- Any generated/cache/temp/vendor exclusions are explicitly stated.
- Relevant Vibyra memory notes are updated when ownership or workflow changed.

If the user asks whether everything is under the limit, answer from the most recent clean line-gate output, not from memory or assumptions.
