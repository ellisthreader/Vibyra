# Desktop - Project Menu And Activity

The far-left project tiles own one custom right-click surface for rare
project-level actions. Start in
`desktop-tauri/src/components/layout/ProjectStrip.tsx` and
`desktop-tauri/src/components/projects/`.

## Interaction Contract

- Right-click, `Shift+F10`, or the Context Menu key opens the selected tile's
  branded menu; ordinary left-click activation is unchanged.
- The menu exposes Project activity, Configuration, and destructive Close
  project. It is viewport-clamped, keyboard navigable, dismissible with
  Escape/click-away, and lazy-loaded so closed project tools cost no startup
  chunk.
- `ProjectActions.tsx` portals every overlay to `document.body`; rendering
  inside the strip would trap dialogs below the titlebar's stacking context.
- Home cards deliberately have no separate remove shortcut. Every project
  close goes through `CloseProjectDialog.tsx`: Continue is confirmation one,
  the final red Close project button is confirmation two.
- Close copy must always state that Vibyra stops that project's previews and
  terminals but never deletes or changes the project folder. The final action
  delegates to `projectStore.remove`; UI code must not duplicate cleanup.
- Configuration edits only `ProjectSpec.name` and its preset identity colour.
  `projectIdentity.ts` owns the shared palette and basename helpers.

## Activity Semantics

`project_activity` is an on-demand native command; opening the sheet is the
only trigger. `commands/project_activity.rs` routes Git/disk work through
`run_blocking_core`. Core ownership is `vibyra-core/src/project_activity*.rs`;
renderer ownership is `ipc/projectActivity.ts`,
`lib/projectActivityPolicy.ts`, and `ProjectActivitySheet.tsx`.

- The sheet shows seven local calendar days.
- Committed churn comes from non-merge Git commits grouped by local committer
  date. It measures project activity, never claims Vibyra/agent attribution.
- Today's tracked diff and bounded, non-ignored untracked text files appear as
  `UNCOMMITTED NOW`; older uncommitted edits are not assigned to past dates.
- Binary files count as changed files but have no invented line total.
- Non-Git folders receive a useful empty state; Vibyra never initializes Git.
- Git output is capped at 4 MiB. Untracked line reads are capped at 512 KiB per
  file and 4 MiB total; omitted data is disclosed as truncated.

## Persistence And Validation

`projectStore.updateProject` validates names/colours and persists through the
existing settings path. `settingsStore.update` rolls renderer settings back if
the atomic native save fails, so Configuration or Close cannot falsely look
persisted. Close failures remain visible and do not optimistically remove the
tile.

Validate with `npm --prefix desktop-tauri run verify`. Focused activity and
two-confirmation contracts live in `desktop-tauri/tests/projectActivity.test.mjs`;
native Git cases live in `project_activity_tests.rs`. The hard 200-line gate
still applies through `node scripts/check-desktop-lines.mjs`.
