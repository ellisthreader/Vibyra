---
name: plan
description: Plan, review, execute, and verify broad or multi-step work. Use when the user asks Codex to make a plan, review a plan, implement a large feature, coordinate subagents, improve UI/design with simplicity in mind, or turn a vague goal into concrete steps before editing.
---

# Plan

Use this skill when the task is large enough that a quick edit would risk drift, rework, or visual/architectural clutter.

## Workflow

1. Restate the goal in concrete terms.
2. Read the smallest relevant project memory, matching local skill, and source files before broad exploration.
3. Write a short plan with clear checkpoints. Keep it practical, not ceremonial.
4. Review the plan before editing:
   - Is the core user outcome preserved?
   - Is the implementation smaller than the first obvious version?
   - Are UI surfaces simpler, calmer, and less control-heavy?
   - Are permission, persistence, and validation boundaries explicit?
   - Does a local skill need to be read or updated so future agents follow the same workflow?
5. Implement the plan in scoped steps.
6. Validate with the narrowest useful checks. For an installed-app update,
   verify the packaged and installed version/signature and launch the actual
   installed app; a successful source build alone does not update a Dock app.
7. Update durable memory or local skills when the work creates reusable rules.

## Simplicity Review

Before editing a “big thing,” remove avoidable complexity from the plan:

- Prefer one strong default path with advanced options hidden behind menus or toggles.
- Avoid adding permanent visible controls for rare actions.
- Do not add extra page headers, labels, cards, or explanations unless users need them to act.
- Keep state ownership obvious: local UI state in local UI modules, route/API state in route modules, durable rules in memory notes.
- Keep subagents scoped to independent work only when the user explicitly requests delegation or the active agent rules allow it.

## UI Review

For frontend work, review the plan against the relevant frontend/design skill before editing.

- Make the first screen useful, not explanatory.
- Keep repeated items compact and stable.
- Use one brand placement per onboarding screen; do not repeat the header logo in
  a hero tile or add promotional copy above an already clear sign-in form.
  Carry welcome lighting into account and path-choice screens as a faint header
  wash; keep inputs/cards opaque and check both themes plus Reduce Motion.
  For path choices, keep descriptions full-width, rollout status visible, and
  one bottom action tied to the selected radio option; put Skip in the header.
- For iOS agent-conversation work, read `docs/ios-conversation-experience-plan.md`.
  Verify live Host/provider event and decision contracts before presenting sample
  chat cards as working features. Require reconnect, stale/duplicate decision,
  control-lease and native keyboard/accessibility acceptance; terminal text and
  project diffs alone do not establish approvals or task-owned results.
  Read `Vibyra/_ai/App/iOS Conversations.md` for implemented ownership. Codex
  default-mode questions use a registered dynamic tool; verify its real completion
  acknowledgement, not only sample cards or a prompt asking for questions.
  Use the isolated native fixture manifest (`mobile/scripts/serve-native-conversation.mjs`)
  for simulator design checks instead of swapping the shared App.tsx entry.
- Hide settings until requested.
- For iOS sidebar work, read `Vibyra/_ai/App/iOS Sidebar.md`. Paint the rail to
  both screen edges and inset its content/footer; keep all chat lists in the
  scrolling area. Verify both themes, short viewports and Reduce Motion with
  `mobile/scripts/verify-drawer-ui.mjs`, plus the isolated native drawer fixture.
- For iOS credit/economy plans, verify the maintained mobile purchase integration
  and actual inference payer before reusing historical billing notes. Review grant
  rollover, trial enforcement and uncertain-cost settlement in backend source;
  catalogue tool support alone does not prove a working agent. Run the configured
  billing economics audit before shipping changed allowances or prices.
- Prefer tabs, icon buttons, menus, and subtle status dots over dashboards of controls.
- Verify desktop and narrow screenshots when practical.
- For transparent UI artwork, verify actual alpha and inspect both light/dark
  composites; a PNG extension or a dark preview is not proof of transparency.
  Keep artwork unboxed when a seamless sheet is requested, use explicit image
  dimensions with contain, and verify the primary action stays visible on a
  compact viewport. Inspect wide modal geometry as well as its child bounds.
- For “match the latest Linux version” requests, verify release branches rather
  than assuming `main` is the newest desktop. Record the exact visual reference
  and distinguish a frontend adaptation from importing that release's features.
- Mac desktop changes must check Command versus Control shortcuts, native
  window close versus Quit, and recovery with multiple same-folder chats.
  Validate the real coordinator's failure and double-click paths, not only
  strings in source. Preserve explicit account, chat ID, saved output and
  worktree ownership; never substitute the most recent chat.
- Mac native capture changes must verify the packaged usage descriptions and
  signing entitlements as well as compilation. Use hardware-free tests for
  capture conversion and cleanup; report actual OS consent/capture as pending
  until tested in the installed app. See the Mac Experience And Sessions note.
- If Vibyra hosts the agent performing an update, keep it running. Finish and
  verify the bundle, provide the Finder installer, and report installed-launch
  verification as pending until the user quits. A running old binary is not
  evidence for the new bundle.
- Before a Mac rollout, check both live architecture feeds, release credentials
  by name only, and the backend's DMG versus app-updater metadata contract.
  A pushed source branch or local ad-hoc bundle is not a published update.
  Preserve the existing Tauri signing key trusted by installed clients.
- For metadata-only Railway releases, inspect the deployed backend contract,
  set variables with `--skip-deploys`, then redeploy the existing snapshot.
  Avoid `--from-source` or uploading an older checkout. Verify original snapshot provenance, both live archive signatures, and the
  existing installer catalogue; a rebuild can change the image digest.
- Distinguish Tauri updater authentication from Apple notarization. If the user
  chooses an ad-hoc Mac beta update, retain mandatory Tauri signature checking
  and verify the Mac code signature; do not block solely on Apple Developer
  credentials or describe that build as notarized. See Desktop/Mac Setup.

- For Desktop-to-iPhone connection work, use the shared encrypted Host transport
  and inspect Desktop/iPhone Connection. Keep viewing separate from command
  authority; verify real existing-PTY output, pairing approval, reconnect,
  revocation and shutdown. Validate the exact release checkout because the
  desktop format gate traverses Host path dependencies, including optional ones.

## Completion

End with the concrete files changed, checks run, and any memory/skill updates made. If tests or screenshots were not run, say why.
