# Vibyra Desktop 0.8.5 — Linux parity and Mac update

## Goal and release baseline

Ship the current Mac desktop product to Linux with the same shared React assets,
routes, settings, account behavior, terminal and Agents flows, while retaining
the native accommodations each OS needs. Ship the same 0.8.5 product update to
Apple Silicon and Intel Mac users. A visual match means the same bundled
components, styles, artwork, fonts where supported, copy and state transitions;
native title bars, dialogs, permission prompts, capture, audio and keyboard
registration must use each OS's integration.

The published Linux baseline is `v0.8.2` at `81757a47874532cba2b6d2916e7ba0b5dcb62796`.
GitHub carries signed AppImage and Debian artifacts. The production release
catalogue and Linux updater still offer 0.8.2. Both Mac updater feeds need to
be probed directly before activation; the public Mac installer catalogue is
currently empty. Local Mac 0.7.9 builds and the current working tree are **not**
published updates.

The current checkout is an ancestor of `v0.8.2` plus approximately 1,997
working-tree changes. A trial three-way merge in an isolated worktree found
591 conflicts (185 desktop, 382 mobile, 12 Host, seven backend, and five
workflow/memory files). A blind version bump or wholesale copy would drop
Linux 0.8.2 fixes. The user worktree must remain untouched by integration.

## Delta inventory to review and port

The file comparison below is between the working product tree and `v0.8.2`,
including untracked source files. It is an integration inventory, not a claim
that every modified line is a new user feature.

| Surface | Working-tree delta | Product and contract review |
| --- | ---: | --- |
| Desktop React | 44 added, 3 absent, 134 changed | Home/start and welcome, navigation, Agents roster and thread, companion chat, preview target selection and gated phone proof, model launch notice, report form, settings, terminal grid and flow control. |
| Desktop native | 59 added, 3 absent, 86 changed in app Rust; 13 added, 2 absent, 25 changed in core | Agent Computer grants and command sandbox, phone preview and relay, account identity, AI/speech, terminal lifecycle and input, screenshots, reports, sessions and performance. |
| Backend | 99 added, 13 changed in `app/`; routes/config/migrations also require review | Agents APIs, remote access, phone notifications, report relay, model release feed, chat connectors, Auto/Jev work, billing and account contracts. |
| Host | 18 added, 23 changed in crates | Conversation artifacts, preview transport and relay, workspace/connection behavior. |
| Shared phone source | 75 added, 414 changed | Desktop imports conversation/scaffold modules from `mobile/src`; validate those imports and matching phone/Host protocol behavior. |

### Exact Linux regressions the merge must prevent

- Preserve `tauri.linux.conf.json` as the native decorated window override,
  with all base window fields retained. Linux must not draw synthetic Mac
  traffic lights or reserve their padding. Preserve Linux Inter and Mac system
  font selection; compare actual WebKitGTK raster output.
- Keep the 0.8.1 ordered input contract: frontend posts each key without
  awaiting the prior IPC, `write_terminal` dispatches synchronously, and the
  per-session PTY queue writes in order without blocking the UI. The current
  working native command is `async`; reconcile it with the newer flow control
  and bounded scrollback changes before packaging. Exercise character echo,
  bursts, Backspace, Shift+Tab and Enter in the actual AppImage.
- Preserve the 0.8.2 account OAuth transient 429/5xx retries and completed
  token handoff through temporary `/api/session` errors. Preserve cancellation
  checks before adopting a token. Add the newer preview-account binding without
  losing that recovery.
- Preserve the 0.8.2 authenticated report POST even if readiness GET fails.
  Merge newer diagnostic and screenshot handling without silently falling back
  to a local webhook for a signed-in account.
- Preserve Linux right-button `pointerdown` project menu handling, keyboard
  context-menu access, rename/close confirmation and active-project watch-root
  reset. Merge the newer selected-project/Home interaction separately.
- Preserve AppImage environment cleanup, `/proc` session discovery, Linux
  audio and screenshot implementations, desktop entry integration, and focused
  Wayland shortcut fallback. The compositor-global Wayland shortcut boundary
  needs an explicit acceptance result.
- Preserve the shared frontend artifact workflow and `github.run_id` artifact
  name so rerun packaging jobs consume the same verified bytes.

## Implementation checkpoints

1. **Freeze inputs.** Record source-tree hashes and a feature inventory once
   concurrent edits settle. Keep the original dirty checkout intact. Create a
   dedicated 0.8.5 branch from `v0.8.2`; bring the current product changes into
   that branch in bounded feature groups. Resolve every conflict semantically,
   especially IPC signatures and platform conditionals. Review `git diff
   v0.8.2...candidate` and ensure every introduced source file is tracked.
2. **Reconcile shared frontend.** Make Mac and Linux packages consume one
   generated `dist` archive and SHA manifest. Review sign-in, Home, project
   wizard/tree, settings, terminal grid, Agents, chat, preview, phone connection,
   model notice and report UI at 960, 1280 and 1440 widths in light/dark and
   reduced motion. Compare Linux WebKitGTK screenshots with the current signed
   Mac build for the same fixture data. Record intentional OS differences only.
3. **Reconcile native desktop and Host.** Enumerate every `invoke` call and
   registered Tauri command, then compile on both OSes. Port Agent Computer
   execution grants and sandbox, terminal flow and process cleanup, speech and
   capture, preview transport, account auth and phone pairing. Test permission
   decline, cancellation, restart and disconnected network behavior, not just
   success. Preserve Linux platform modules and the 0.8.1/0.8.2 fixes above.
   Keep the phone Preview proof behind its current disabled flag until the
   physical cellular and installed-app gates recorded in Projects And Preview
   pass; parity with Mac must preserve that release boundary.
4. **Reconcile backend.** Diff migrations, API routes, job queues, config and
   client payloads against the deployed Railway snapshot. Deploy server
   changes before clients only when old clients remain compatible. Keep
   server-only Discord, model and provider secrets out of bundles. Validate
   account, reports, Agents, remote relay, preview, connectors and billing
   contracts with focused Feature tests and the full suite at a 1 GiB PHP
   memory limit. Verify queue and scheduler operation after deployment.
5. **Prepare 0.8.5 metadata.** Set Tauri/package/lock versions to SemVer
   `0.8.5`; update both Linux and Mac changelog records, the in-app What's New
   entry and versioned release hero art. Preserve Linux 0.8.0–0.8.2 history.
   Review one short feed note and the public GitHub release notes. Do not
   silently reuse a 0.7.9 label or previous artwork.
6. **Run gates on the exact commit.** Desktop lines, dead code, tests,
   TypeScript/Vite, Rust fmt/clippy/tests, Host and mobile shared-contract
   checks. Run the actual signed Linux AppImage and Debian package checks on
   Ubuntu WebKitGTK, including sign-in recovery, project actions, report POST,
   terminal input and screenshot evidence. Run Mac arm64/x64 release jobs,
   verify Developer ID identity, entitlements, bundled helper, updater
   signature and installed native launch. Verify packaged frontend manifest
   hashes match across architectures and Linux formats.
7. **Publish only passing artifacts.** Download CI artifacts from the exact
   commit; verify Tauri minisign signatures against the shipped public key,
   sizes and SHA-256 before and after upload. Stage unique paths on the Railway
   volume. Dry-run the Mac publisher with explicit `--version 0.8.5`, then
   activate Mac arm64/x64 update metadata; set Linux AppImage/Deb metadata
   with `--skip-deploys` and redeploy the existing backend snapshot. Never
   point an updater at a DMG or overwrite the signed 0.8.2 bytes. Probe both
   Linux updater formats from 0.8.2 and 204 at 0.8.5; probe both Mac arches
   from an older version and 204 at 0.8.5. Verify live archives again, public
   downloads, `/up`, and unchanged Windows metadata; publish the GitHub
   release and tag only after the live checks pass.
8. **Post-release acceptance.** On a Linux install and a Mac install, open the
   actual installed executable, check version and signature, exercise sign-in,
   project/terminal/Agents/report/preview routes and confirm an old client is
   offered the update. Preserve running agent workspaces; restart only through
   the normal user-facing update flow. Record artifact hashes, workflow run,
   deployment ID, feed responses and any native limits in the parity note.

## Plan review and stop conditions

The shortest safe implementation is to reuse shared UI and backend contracts,
with OS-specific native adapters only. No new visible Linux-only UI is needed.
The release cannot be described as 100% accurate until the same frontend bytes
ship to both OSes and the native acceptance matrix passes. Source tests and
browser fixtures alone cannot establish this. A merge with unresolved
conflicts, missing Linux config, a red signed package job, absent Mac signing
credentials, differing frontend manifests, a broken updater feed, or an
unverified Railway artifact is a publication stop.

## Work started

- Read the plan and Obsidian workflows and checked the production Linux feed,
  release catalogue and GitHub `v0.8.2` assets.
- Created isolated baseline `/tmp/vibyra-085-base-20260923` and integration
  `/tmp/vibyra-085-integration-20260923`; the original dirty checkout is
  unchanged. The trial merge exposed 591 conflicts and established the
  required reconciliation list above.
- The production Linux feed currently advertises 0.8.2 to a 0.8.1 client.
  0.8.5 has not been built or published.

## Integration review — 24 September 2026

- The public candidate branch `codex/release-0.8.5-public` starts at `v0.8.2`
  and carries the current desktop, Host, shared phone and backend source. The
  private working-tree snapshot and personal vault files are absent from that
  branch. The release changelog note is present because the desktop release
  gate reads it.
- The frontend remains one shared React/CSS build for Mac and Linux. The Linux
  Tauri window override, GTK controls, platform fonts, ordered terminal input,
  Shift+Tab and OAuth/report recovery were retained. Agent Computer now sends
  the host OS to the backend instead of registering Linux as macOS; user-facing
  grant and approval text names the actual computer. The backend migration is
  additive and its new local-runner capability remains off until native
  acceptance.
- Production backend source hashes match the candidate throughout app,
  config, routes, migrations, resources and scripts except 16 changed files
  and six new files for Agent Computer, connector approval rules, prompts and
  report handling. Ten additional production files are generated marketing
  assets. The candidate backend passed 808 PHPUnit tests with a 1 GiB memory
  limit in an isolated home-directory copy. Host workspace tests and desktop
  frontend, build, Rust lint and Rust tests passed locally. Mobile check passed
  once; a later run under heavy machine load had two timing failures in nearby
  connection tests, which require an idle focused rerun.
- Initial GitHub runs `35923531300` and `35923557825` stopped in frontend
  tests because the public branch excluded the Obsidian release changelog that
  `whatsNew.test.mjs` requires. This is corrected in the next candidate commit;
  those runs produced no release packages. The signed AppImage, Debian package,
  both Mac archives, native screenshots, signatures and live updater feeds
  remain publication gates.
