---
name: vibyra-optimise
description: Audit and refactor an app for permission breaches, code organization, file-size limits, and optimization. Use when asked to find places where users should approve or decline potentially sensitive actions, add balanced approval UI, split large files, organize code into focused types/contexts/hooks/components, or enforce a no-source-file-over-200-lines standard.
metadata:
  short-description: Permission and code-size audit
---

# VibyraOptimse

Use this skill when the task is both product-sensitive and structural: permissions, user approval flows, refactors, file-size limits, and app code organization.

## Core Standard

Find the sweet spot:

- Do require approval for actions that write files, execute generated code, apply agent edits, connect/control another device, spend credits, expose private local paths, or persist trust decisions.
- Do not require approval for read-only previews, local draft text, obvious navigation, reversible UI state, or low-risk status refreshes.
- Prefer project/session-scoped trust over global trust. “Always allow” should be narrow and visible.
- Keep every source code file under the project’s limit, commonly 200 lines. Exclude generated folders and temporary tool artifacts.

## Workflow

1. Read repo-specific agent instructions and memory notes first.
2. Map the risk surface before editing:
   - write/apply/discard paths
   - remote desktop or device control
   - billing/credits
   - authentication/session persistence
   - local file browsing and generated app preview
3. Choose approval points:
   - add explicit approve/deny for irreversible or non-obvious effects
   - add discard/cancel endpoints where pending work exists
   - make UI copy concrete: what will change, where, and whether trust will persist
4. Refactor with small ownership boundaries:
   - split hooks by action family
   - split UI into feature components
   - move shared types to `types`, `context`, or feature-local type files
   - move route/service helpers into traits/modules only when the boundary is real
5. Enforce the file-size gate after every major split.
6. Run focused validation:
   - typecheck
   - syntax checks for changed backend/desktop files
   - targeted smoke tests for approval/apply/discard flows when available

## Line-Count Gate

Use a gate like this, adjusted for the repo’s generated directories:

```bash
rg --files -g '!tmp' -g '!node_modules' -g '!backend/vendor' -g '!.git' -g '!.expo' -g '!.vibyra-agent' \
  | rg '\.(ts|tsx|js|jsx|mjs|php|css|html)$' \
  | xargs wc -l \
  | awk '$2 != "total" && $1 > 200 {print}' \
  | sort -nr
```

If the gate reports generated artifacts only, say so explicitly and keep the app-source gate clean.

## Refactor Patterns

- Provider files should coordinate hooks, not own every action.
- Large hooks should become a small coordinator plus focused hooks such as `use*PromptActions`, `use*FileActions`, `use*ConnectionActions`, or `use*ResultHandlers`.
- Large components should extract repeated panels, menus, cards, and modals into feature-local components.
- Backend controllers should delegate response shaping, validation helpers, and apply/discard logic to traits or service modules.
- Desktop/server route files should delegate asset serving, project browsing, project creation, and agent execution to modules.
- Avoid creating a single “helpers” dump. Name modules after the behavior they own.

## Validation Checklist

Before final response:

- App-source line-count gate returns no files.
- Typecheck passes for TypeScript projects.
- Changed JS/MJS files pass `node --check` when applicable.
- Changed PHP files pass `php -l` when applicable.
- Permission flow has all three states represented where needed: pending, approved/applied, denied/discarded.
- The final answer names any excluded generated folders, failed checks, or remaining risks.
