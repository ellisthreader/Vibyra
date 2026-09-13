# Teammate creation and configuration reliability plan

Status: implementation and local verification complete, 7 September 2026.
The seven defect fixes are implemented on `fix/teammate-reliability`.
Packaged Linux/Windows acceptance and publication remain separate delivery gates.
See `docs/audits/teammate-reliability-2026-09-07/REPORT.md` for measured results.

## Outcome and source

A user can create one teammate, start useful work, configure its memory and
skills, and return to the same saved configuration after restarting Vibyra.
Failures explain what happened and preserve a safe way to continue.

The seven findings were reproduced against 0.6.1 source
`6485f8c920acaf81964fbb3e81f9a7e6421cb72c` in worktree `release-0.6.0`.
The current task worktree is an older safe-mode snapshot. Before implementation,
refresh the installed/release source mapping and create an isolated branch from
the applicable release source. Preserve existing worktrees and user databases.
The earlier audit's Chromium fixtures used mocked IPC; native execution remains
an explicit acceptance gate.

## Ordered implementation

| Step | Work | User outcome | Required proof |
|---|---|---|---|
| 1 | Correct shared modal placement and focus ownership. | Teammate, routine and skill forms accept clicks and typing; Cancel, Close and Escape work. | Exercise create and edit dialogs inside the actual workspace hierarchy, including native WebKit. |
| 2 | Separate provider loading, readiness, validation and saving states. | The engine shown is the engine submitted; unavailable providers have a clear recovery action. | Open before/during/after probing, fail and retry probing, and test zero/one/multiple usable engines. |
| 3 | Separate committed writes from list refreshes and protect retries natively. | A saved teammate opens immediately; retrying never duplicates the same operation. | Inject refresh failure and lost responses after commit; retry and restart; assert one profile and home grant. |
| 4 | Use explicit pending state for routine and skill saves. | One submit creates one routine, skill or intended skill revision. | Rapid click, Enter, click-plus-Enter, delayed replies, errors, close/reopen and duplicate native requests. |
| 5 | Make skill assignment reflect confirmed saved state. | Checked skills are actually assigned to that teammate. | Fail assignment; verify previous state, readable error, retry, reload and no cross-teammate update. |
| 6 | Preserve memory drafts until confirmed saved. | A save failure retains the note; successful saving adds it once. | Fail writes and refreshes separately; retry; type a newer draft during an earlier save. |
| 7 | Verify complete useful journeys and package delivery. | The repaired feature works in the installed app, across restarts. | Real teammate/chat/configuration/routine journeys, regression checks and exact build provenance. |

## Shared dialog repair

- Render `EditorDialog` through a shared overlay root outside the workspace
  that `useModalFocus` makes inert. Preserve the current compact visual design.
- Make focus handling respect dialog ownership: never inert a dialog ancestor,
  preserve pre-existing inert state, and restore it only when its owning modal
  closes. Only the topmost modal handles keyboard trapping and Escape.
- Focus the intended field once on opening. State updates must not reset the
  caret or focus. Restore focus to a surviving opener when closed.
- Separate `submitting` from validation-based submit disabling; add proper
  modal semantics and accessible, local validation/error announcements.
- Test Settings and other users of the shared focus hook. Include short windows,
  scrolling, keyboard-only use, Shift+Tab, IME composition and repeated opening.

## Provider and form state

- Represent capability loading, failed checks, no compatible engines and ready
  engines explicitly. Offer a recheck when it can resolve the problem.
- When results arrive, select an available default if the user has not made a
  choice. Preserve deliberate choices while available; if one becomes unusable,
  show that state and require a replacement rather than silently changing it.
- Derive the dropdown, availability explanation and submission from one selected
  engine. Prevent submission before capability readiness. Runtime authentication
  and protected execution still need checking when an actual task starts.
- Mark Name as required, distinguish placeholder text from an entered value,
  mirror native name rules, and clearly mark the purpose field optional.
- Keep operation-specific errors separate from unrelated roster/work failures.

## Reliable write and retry contract

- Return explicit saved data or an explicit failure from the affected store
  actions. A later read failure must not reclassify a committed write as failed.
- Insert/update the authoritative returned record in the local store immediately.
  Background refresh failures offer a read retry without submitting another write.
  Protect these updates against stale refresh responses and account switches.
- Add a stable request token for teammate creation, routine creation, skill
  installation/revision and memory addition. A retry of the same submitted
  operation reuses its token; a genuinely new submission receives a new token.
- Native SQLite records the account, operation, request token, payload fingerprint
  and outcome transactionally with the change. Repeated identical requests return
  the existing outcome; reuse with different content fails explicitly. Tokens
  neither grant authority nor substitute for native account/ownership checks.
- Keep minimal pending-operation identity available for reconciliation after a
  renderer reload. Reconcile an uncertain operation before accepting changed
  content as a new submission. Do not put draft text in diagnostic logs.
- Preserve the existing migration/backup mechanism and validate existing databases.
  Make home preparation retry-safe with a stable native ID; injected failures
  must not delete pre-existing folders or leave duplicate homes/grants.
- A UI timeout means the outcome is unknown, not that native work was cancelled.
  Provide status reconciliation and a safe retry; avoid an endless busy state.
- Hold an immediate per-operation submission guard in the store as well as a
  disabled submit button. Release it on confirmed completion/failure and keep
  uncertain requests distinguishable until reconciled.
- Before submit, Cancel discards the local form. During a submitted save, Close
  dismisses the view without pretending to cancel the write; the store retains
  operation state and surfaces its eventual result without reopening another
  teammate's screen or losing the pending request on remount.

## Skills, memory and visible success

- For assignments, retain the confirmed checkbox value while saving and show
  pending state on that row. Commit the requested value only after success;
  failure preserves the previous value with a nearby retryable error. Block
  conflicting requests for that assignment and ignore stale responses after
  navigating to a different teammate.
- For memory, capture the submitted text and clear only that draft after a
  confirmed save. Preserve any newer text entered while the save was pending.
  Use the returned memory record immediately even if refreshing the list fails.
- Apply the same record-first reconciliation to routine and skill save results;
  preserve form contents on failure and visibly identify pending saves.
- Successful creation opens the existing teammate Chats view and its New chat
  action. Keep Skills and Settings reachable; no extra setup wizard is needed.
  Explicit folder grants remain necessary before project access.

## Acceptance and delivery gates

1. Convert each audit reproduction into a regression test that fails before its
   fix. Use production components in the actual workspace structure, not only
   detached forms or synthetic click handlers that bypass inert behavior.
2. Test native writes using scratch databases: concurrent duplicate requests,
   lost responses after commit, reopen/retry, failed transactions, payload
   mismatch, account separation, existing-data migration and folder handling.
3. Test renderer failure recovery, navigation/account switching, stale responses,
   close/reopen, repeated saves and interaction/accessibility states. Verify
   database records and returned values, not just button labels or screenshots.
4. Run frontend tests, typecheck, build and canonical source-size gate, plus
   relevant Rust tests and the required workspace format/clippy/test checks.
   Add the focused browser regressions to CI. Keep native Cargo work serialized.
5. In a native Linux candidate, create a teammate, enter a brief, grant a scratch
   folder, start a real supported-provider chat and verify an expected harmless
   result. Add memory and assign a skill, then demonstrate their use in a fresh
   chat. Restart and verify the same records/configuration and chat history.
6. Create and edit a routine and skill. Verify exactly one intended revision or
   routine record; observe a harmless scheduled run, its history and restart
   persistence. Test supported engines individually and document unavailable
   credentials/provider paths as outstanding rather than inferring success.
7. Exercise the packaged Windows UI as well as Linux if shipping this shared
   change to both. Package the tested source commit, verify artifact hashes and
   repeat the core create/save/restart journey from that candidate. Publishing
   or replacing the installed app is a later delivery step after review.

Completion requires all seven findings resolved, the above evidence recorded,
and no unresolved critical/high regressions in the affected journeys. A future
zero-bug guarantee is not an acceptance criterion; repeatable native behavior,
failure recovery and regression coverage are. Update the focused Obsidian note
and relevant diagnostic skill with the final implemented contracts and evidence.
