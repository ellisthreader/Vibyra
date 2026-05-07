# Memory Protocol

Purpose: minimize token use by routing agents through small, durable notes before reading source files.

## Read Order

1. `Project Context.md`
2. `Context Map.md`
3. Exactly one domain note unless the task crosses boundaries:
   - `Vibyra App Memory.md`
   - `Vibyra Desktop Memory.md`
4. Only then inspect source files named by the domain note or found with a targeted search.

## Token Rules

- Do not read the whole repo.
- Do not read generated folders: `node_modules`, `.git`, `.expo`, `.vibyra-agent`, `backend/vendor`.
- Prefer `rg` for symbols, route names, component names, and error strings.
- Read files in slices when only one function or area is needed.
- Keep durable notes short; move long logs and temporary detail to `_ai/Runs/`.

## Update Rules

Update memory only when learning stable context:

- architecture changes;
- important file ownership;
- route/API contracts;
- workflows for running or testing;
- recurring bugs or decisions.

Do not add transient command output, stack traces, or speculative plans to core notes.

## Practical Budget

For most tasks, read no more than:

- this protocol;
- `Project Context.md`;
- one domain memory note;
- two to five source files.

If more context is needed, summarize what was learned before reading more.
