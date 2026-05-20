---
name: VibyraRefactor
description: Safely refactor and optimize Vibyra code when files are too long, messy, over-parameterized, weakly typed, not using appropriate context/hooks/modules, or generally unorganized. Use when asked to clean up code, enforce a no-source-file-over-250-lines limit, split oversized files, reduce parameter sprawl, add focused types/contexts/hooks/components, or verify that behavior still works after a refactor.
metadata:
  short-description: Safe refactors and 250-line gate
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

## First Pass

1. Read repo instructions and relevant Vibyra memory before broad exploration.
2. Check current offenders before editing:

```bash
rg --files src backend/app backend/tests desktop/lib desktop/assets -g '*.{ts,tsx,js,jsx,mjs,cjs,php,css,html}' \
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

## Refactor Patterns

- Large hooks: keep the original hook as coordinator; extract focused action factories or hooks such as tool actions, command approval flows, reply handlers, predicates, message updates, or mode decisions.
- Large components: move header helpers, derived state builders, modal bodies, repeated cards, and capability checks into feature-local helpers/components.
- Large API utilities: split request basics, reachability, streaming/SSE parsing, payload types, and error helpers.
- Large style maps: split by screen/section/state, then re-export or merge to preserve existing style names.
- Backend controller traits: split by real behavior such as validation, attachments, provider payloads, preview extraction, streaming response handling, storage, ranking, and payload shaping.
- Tests: split oversized tests into focused classes; delete empty placeholder classes.
- Prefer named behavior modules over generic helper dumps.

## Parameter And Type Cleanup

- If a function has many parameters, introduce a typed options/dependency object only when it improves call-site clarity.
- Put shared domain types in the existing domain/type files; put feature-local types near the feature.
- For React code, prefer context/hooks when state or behavior is shared across a feature; avoid prop chains that only shuttle data through unrelated components.
- Keep dependency objects explicit. Avoid hiding large mutable app state inside anonymous "helpers" where behavior becomes harder to audit.

## Validation

Run the checks that match the touched surfaces:

- TypeScript: `npm run typecheck`
- Desktop MJS tests: `node --test desktop/lib/preview.test.mjs` or the relevant test file
- JS/MJS syntax: `node --check <file>`
- PHP syntax: `php -l <file>`
- Backend focused tests: prefer `./vendor/bin/phpunit --filter '<pattern>'` when Artisan reports warnings unclearly
- Final line gate across agreed source scope

If a runner prints passing assertions but exits non-zero, investigate. Common causes are empty test classes, warnings, deprecations, or hidden boot errors.

## Final Response Standard

Report only after:

- The final line gate is clean.
- Tests/typecheck/syntax checks passed with clean exit codes, or failures are clearly named.
- Any generated/cache/temp/vendor exclusions are explicitly stated.
- Relevant Vibyra memory notes are updated when ownership or workflow changed.

If the user asks whether everything is under the limit, answer from the most recent clean line-gate output, not from memory or assumptions.
