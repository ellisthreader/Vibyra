# App - Chat Code Changes

Read this for edit permission approval, changed-files cards, run artifact filtering, and preview code review.

## Files

- `src/context/useAgentActions.ts`
- `src/context/useAgentResultHandlers.ts`
- `src/context/useEditPermissionActions.ts`
- `src/context/useAppState.ts`
- `src/utils/files.ts`
- `src/screens/workspace/inline/EditPermissionCard.tsx`
- `src/screens/workspace/inline/chunk23.tsx`
- Desktop/backend producers: `desktop/lib/agent.mjs`, `backend/app/Services/Concerns/GeneratedFileHandling.php`

## Edit Permission Gate

Assistant messages with `codeChanges` carry `editApproval: "pending" | "allowed" | "denied"`. `finishRealAgent` sets `"allowed"` only when `state.editApprovals[projectId] === "always"`; otherwise pending.

Pending messages render `EditPermissionCard` with No, Allow, and Allow always. They also render `CodeChangesCard` below the gate so users can review files before applying.

Desktop `/agents/start` honors `apply: false` by returning pending changes plus `pendingApplyId` without writing project files. `AppContext.approveEdits` calls `/agents/apply`; `denyEdits` calls `/agents/discard`. `apply: true` is sent only for project-level Allow always.

If a project has an unresolved pending `pendingApplyId`, `useAgentActions.startAgent` must not launch another desktop edit run for that project. It should add a reminder to use the existing approval card. Applying or denying pending edits should resolve every chat message that references the same `pendingApplyId`, and desktop apply must reject stale plans when target files changed after generation.

`editApprovals` persists in app state and cloud sync. Approval is per-project, not global.

## Changed Files Card

Desktop completions attach `codeChanges`, `codeFiles`, and `codeProjectId`. `MessageBubble` shows filename, `+/-` counts, Review expansion with syntax-highlighted `CollapsibleCodeBlock`, and Revert when `previousBody` exists.

Cloud `/api/chat` runnable previews return only `app.html`; `finishOpenRouterAgent` synthesizes an `index.html` preview-only code card. Its revert action calls `AppContext.revertPreviewCode`.

Do not reintroduce a review modal or left timeline rail. Keep the card visually aligned with `AppPreviewCard`: dark surface, 14px radius, purple border, 42px gradient icon, uppercase label rhythm, green `+` counts, red `-` counts.

## Run Artifacts

Files under `.vibyra-agent/runs/` are background logs. They should never appear as the current file, chat-message file labels, streamed assistant reply, persisted chat history text, or LLM history.

Helpers: `isRunArtifactPath(path)` and `isRunArtifact(file)` in `src/utils/files.ts`. `useAppState.derived.selectedFile`, `useAgentActions.resolveTarget`, and local chat helpers skip run artifacts for active-file derivation.

Keep run artifacts in `app.files` because they are useful for changes cards and undo, but make them invisible to "active file" behavior.

## Implementation Split

`useAgentActions.ts` orchestrates prompt submission only. `agentActionHelpers.ts` owns target resolution and optimistic agent creation. `useAgentChatMessages.ts` owns pending rows, streaming, and failures. `useAgentResultHandlers.ts` owns desktop/OpenRouter success handling and approval metadata. Keep these files under 200 lines.
