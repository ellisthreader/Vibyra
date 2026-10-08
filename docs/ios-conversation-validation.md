# iOS conversation verification

Verified 9 September 2026. These checks cover implementation behavior and
rendering; they do not establish physical-iPhone release acceptance.

## Presentation

`cd mobile && node scripts/verify-conversation-ui.mjs` passes the real shared
conversation renderer through a fixture-only browser entry. It checks 375×667
and 430×932, light and dark themes, with reduced motion, across idle, working,
permission, question, declined, completed, failed, disconnected and observer
states (36 captures). Permission targets meet the 44-point minimum. Selecting
a question option does not submit; pressing Send answer sends the expected
question/option identity. Disconnected and observer controls cannot respond.

Screenshots are in `/tmp/vibyra-conversation-screenshots/` by default; use
`VIBYRA_SHOTS` to change the destination and `CHROME_PATH` for Chrome. This
harness substitutes only Expo's unused Node server font context for browser
bundling. Conversation components, styles, icons and callbacks are real.

Native iPhone 17 / iOS 26.5 Simulator captures were inspected:

- `/tmp/vibyra-native-conversation.png`: native conversation renderer with a
  pending permission, activity disclosure and both decision actions.
- `/tmp/vibyra-native-integrated-conversation.png`: real
  `ConversationSessionScreen`, project context, pending permission, composer,
  Stop action and safe-area layout with fixture workspace data.
- `/tmp/vibyra-native-live-conversation.png`: actual paired native conversation
  after an authoritative real Codex completion, with the idle composer.
- `/tmp/vibyra-native-keyboard-conversation.png`: actual software keyboard and
  editable next draft while a permission is pending. Composer and Stop remain
  entirely above the keyboard; typing did not submit a turn.

To reproduce the native fixture, keep the existing mobile Metro running, then
run `node scripts/serve-native-conversation.mjs` from `mobile/` and open
`exp://127.0.0.1:8092` in Expo Go. It serves a separate manifest targeting
`tests/nativeConversationFixture.tsx`; it never edits the product entry point.
Each response needs a fresh update ID and creation time to avoid Expo Go's
update database uniqueness constraint. Stop that fixture server and reopen
`exp://127.0.0.1:8081` when finished. Preserve the main Metro process.

## Real Codex contract

Installed `codex-cli 0.153.4` successfully initializes app-server over stdio on
macOS arm64 with `experimentalApi: true`. Matching schemas were generated
locally, including experimental dynamic-tool definitions.

`node host/scripts/verify-codex-conversation.mjs` passes a real bounded,
tool-free turn in an ephemeral temporary workspace: streamed assistant deltas,
authoritative assistant completion and completed turn were all observed.

The `question` probe deliberately fails if the built-in request_user_input
request is absent. On this version, a default-mode thread did not emit that
request despite an explicit prompt. Do not use instructions alone as evidence
that the built-in question tool is available.

The `dynamic-question` probe passes in default mode using the explicitly
registered `vibyra_ask_user` tool. The provider emits `item/tool/call`; the
response uses `contentItems` with `type: inputText` and `success: true`.
Acknowledgement is `item/completed` for `dynamicToolCall`, with its item ID equal
to the request's call ID. This flow did not emit `serverRequest/resolved`.
Execution approvals retain their separate provider authorization path.

The `approval-decline` and `approval-accept` real probes pass: the provider emitted
`item/commandExecution/requestApproval`, acknowledged the decline through
`serverRequest/resolved`, and the isolated marker file was not created after
decline. Accepting the exact marker command produced the marker and a completed
turn with the same acknowledgement lifecycle.

The `interrupt` probe passes: requesting `turn/interrupt` after a harmless
sleep command starts produces authoritative `turn/completed` with status
`interrupted`. It does not rely on killing the app-server process to report
the turn as interrupted.

Probe reports contain event identities and lifecycle metadata, not credentials
or private transcripts, in their printed temporary workspace paths. The probe
never targets the repository. Approval modes restrict acceptance to the exact
isolated marker command, and declined execution must leave no marker.

## Real native encrypted integration

`cd mobile && node scripts/verify-native-conversation.mjs` passes on the booted
iPhone simulator. It starts an isolated debug Host, creates fresh fixture
pairing keys, approves only that fixture's key, and uses the production
`WorkspaceStore`, `RpcClient`, `RuntimeBridge` and `ConversationSessionScreen`.
Only account and storage dependencies are fixture-only: accounts are disabled
and trust stays in memory so the user's saved computer is never replaced.

The real native actions create a structured Codex session, obtain control,
submit a bounded tool-free prompt and receive an authoritative completed turn.
Assertions confirm connected state, active control, conversation runner and
the expected actual assistant response. The script captures the native screen,
shuts down its isolated Host and restores the normal Expo app on port 8081.
Reports remain under its printed temporary directory.

This test found and reproduced an iOS transport defect: the embedded runtime's
`https://localhost` origin caused WKWebView to reject a direct `ws://` Host
connection before pairing. Key generation succeeded, but WebSocket opening
failed and Host never received a pairing request. Using `http://localhost`
for the embedded iOS page made the complete encrypted native test pass.
`RuntimeBridge.tsx` now applies this origin only on iOS and keeps the matching
navigation allowlist. Noise encryption, Host key verification, invitation
authorization and the Android origin remain unchanged.

## Remaining acceptance

Final repository checks also passed: `npm run check:mobile` (56 tests,
TypeScript, generated assets and the 151-file source line gate) and the Host
engine suite (35 tests: 17 conversation and 18 existing engine checks). Two
opt-in live Engine tests are ignored by the default command and were run
separately: real streaming/recovery and dynamic-question handling passed.
The debug Host build passed. Fixture servers on 8092/8093 were stopped and
Simulator was restored to the normal app; the original Metro on 8081 stayed
running throughout verification.

Physical iPhone lock/unlock, network loss and mobile-data transport, VoiceOver,
Dynamic Type, and real OS keyboard recovery require separate device evidence.
Presentation fixture screenshots alone are not evidence of a live paired turn;
the separate native encrypted integration above provides Simulator evidence.
Host integration and application state tests are reported separately by their
test commands; direct provider probes do not replace those checks.
