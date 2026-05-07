# Current Tasks

Last updated: 2026-05-07

## Now

- Keep `isBuildPrompt()` in sync between `backend/app/Http/Controllers/Concerns/ChatPrompting.php` and `src/context/useAgentActions.ts`.
- Verify mobile chat token usage on phone with the new caps (expect ~200–500 input + ≤800 output for plain chat).

## Next

- Periodically verify OpenRouter output caps if OpenRouter changes chat-completion request naming again.
- Periodically fold useful facts from `_ai/Runs/` into the durable notes.
- Decide whether to expose a per-user "build mode" toggle instead of regex detection if false negatives appear.

## Done

- Created the Vibyra Obsidian vault and starter memory notes.
- Wired desktop agent runs to save compact Obsidian run notes when the vault is available.
- Capped OpenRouter `max_completion_tokens` (800 chat / 3000 build) and slimmed the system prompt by default.
- Added backend coverage asserting the OpenRouter payload uses `max_completion_tokens` and omits deprecated `max_tokens`.
- Trimmed mobile chat payload (history window, `fileBody` slice) to match backend caps.
- Added 30s cooldown to `useCloudSync` after failures to stop console error spam.
- Added `Vibyra Backend Memory.md` and wired it into Welcome / Context Map / Agent Prompt.
