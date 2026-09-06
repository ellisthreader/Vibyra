# Vibyra for iPhone

The new Graphite + Cobalt remote workspace lives here. The repository-root
`src/` app is the legacy client. This app is a development foundation, with
real Host terminals, agent sessions, and a conversation-first mobile interface.

## Run

From the repository root, build the maintained encrypted transport once:

```bash
./host/scripts/build-wasm.sh
cd mobile
npm ci
npm run web
```

The app opens on a first-run welcome marked **Work in progress**. Connect your computer,
explore an explicitly labelled sample workspace, or choose **Set up later**.
Reopen setup from **Settings → Welcome and computer setup**. No Vibyra account
is required for this Host preview. After connecting, choose a project
and Claude Code, Codex, or Terminal, then continue that session from the sidebar.
A prompt entered before creating a chat carries over as an unsent draft.
The sidebar searches chats and filters terminals independently.
Optional sample content is under **Settings → Open sample workspace**; it never
sends commands or provider requests.
The browser keeps device keys in memory; reloading requires fresh enrollment.

For an Expo Go phone preview, run `npm run phone` from this directory or the
repository root. This launches the new SDK 57 app on port 8081, explicitly in
Expo Go mode. Use current SDK 57 Expo Go and the same Expo account in the
CLI and phone. Verify and warm the LAN iOS bundle before sharing its QR.
For native development, use `npm start` with an installed development build.
`npm run ios` builds locally on a Mac with Xcode. The included EAS profiles
are configuration foundations; this task did not build/sign an iPhone binary.

## Connect a real computer

Run Host against a folder you explicitly choose:

```bash
./host/scripts/run.sh --project /absolute/path/to/project --pair
```

The default listener is loopback. For a trusted LAN, supply `--listen` and
`--public-url` with a computer address reachable by your phone. Paste the
short-lived pairing link into **Connect computer**, then approve the requesting
device key in the Host console. Only trust your own devices: terminal control
runs with the computer user's shell permissions, including outside the selected
project. The file browser has a narrower project-root boundary.

Existing sessions open in observation mode. **Take control** requests the
Host's exclusive input lease. Disconnecting the phone leaves the process running;
stopping a session is a separate action. An uncertain send is never retried
automatically. Reconnect retrieves a bounded snapshot of current output.

## Checks

```bash
npm run check
npm run export
npm run verify:terminal
# With the web preview and compiled Host available:
npm run verify:ui
npm run verify:host-ui
```

The terminal check uses installed Chrome (`CHROME_PATH` can override its path).
Run the UI verification script against an already-running web preview. See
`../docs/ios-mobile-implementation-status.md` for evidence and open milestones.

## Current boundaries

- Native device keys use SecureStore; browser keys are intentionally volatile.
- Drafts survive navigation in the running app, but are currently memory-only.
- Live Claude/Codex launch their installed interactive terminals. The richer
  conversation, approval and result UI is labeled sample content in demo.
- File review reads the current project working tree, including other work.
- Account-bound enrollment, desktop IPC, production relay operations, scoped
  structured approvals, native qualification and App Store delivery remain open.
- Do not expose this prototype as a qualified public internet execution service.

Generated transport/terminal assets are rebuilt by start/export hooks. They are
bundled locally, with no remote JavaScript or credentials in preview content.
Composer paste framing follows the active [xterm terminal mode](https://xtermjs.org/docs/api/terminal/interfaces/imodes/); multiline input is rejected when the current program does not enable bracketed paste.
Full native keyboard/IME qualification remains open.
