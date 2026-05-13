# Memory Protocol

Purpose: minimize token use by routing agents through small, durable notes before reading source files.

## Read Order

1. `Memory Protocol.md` (this file, usually from repo instructions)
2. `Context Map.md`
3. `Project Context.md`
4. Exactly one domain index unless the task crosses boundaries:
   - `Vibyra App Memory.md`
   - `Vibyra Desktop Memory.md`
   - `Vibyra Backend Memory.md`
5. If the domain index points to focused topic notes, read exactly one focused note for the task.
6. Only then inspect source files named by the focused note or found with a targeted search.

## Token Rules

- Do not read the whole repo.
- Do not read generated folders: `node_modules`, `.git`, `.expo`, `.vibyra-agent`, `backend/vendor`.
- Prefer `rg` for symbols, route names, component names, and error strings.
- Read files in slices when only one function or area is needed.
- Keep durable notes short and topic-scoped; move long logs and temporary detail to `_ai/Runs/`.

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
- one domain index and one focused topic note;
- two to five source files.

If more context is needed, summarize what was learned before reading more.

## Note Size Rules

- Index notes should route, not explain; keep them under about 60 lines when practical.
- Focused notes should fit one feature/workflow and stay under about 80 lines when practical.
- Split notes when a section grows enough that a future task would not usually need the whole thing.
- Prefer filenames that match user language, for example `AI Live Chat.md`, `Live Preview.md`, or `Pairing And Connection.md`.
- Long specs and decision logs are deep references. Do not read them by default; use `rg` for exact terms and then read only the matching section.
