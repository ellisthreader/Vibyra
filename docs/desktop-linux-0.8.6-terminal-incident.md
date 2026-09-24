# Linux Desktop 0.8.5 typing incident and 0.8.6 correction

## Incident

Linux 0.8.5 users reported that keyboard typing into a newly opened terminal
stopped working after updating from 0.8.2. The live Linux updater confirmed
0.8.5 was the offered version. No matching public GitHub issue was found.

## Finding

The PTY writer and ordered `write_terminal` IPC path still worked when xterm
had focus. The regression was in focus handoff: pane insertion updated the
store's `focusedId`, but `terminalSpawnActions.placePane` did not request focus
for xterm's hidden input textarea. The existing Linux native smoke manually
focused that textarea before sending keys, so its successful real-PTY test
could not detect a missing focus handoff after a user launches a terminal.

## Correction

Visible running panes now call `requestTerminalFocus` as they are inserted.
The terminal registry retains the request until the pane mounts; hidden panes
do not take focus. The Linux native smoke no longer forces focus and instead
requires the newly opened terminal to own keyboard focus before typing.

The 0.8.5 source also gated the new-models launch notice with `isMac`. The
shared notice is now available on Linux after First Welcome. Companion Chat,
Agents conversations, project tools and the shared workspace were already in
the Linux bundle; the review found no OS gate on those surfaces.

## Release acceptance

- Run the actual signed Linux AppImage through WebKitGTK. Confirm the GPT-6 /
  Claude Opus 5.5 notice is visible, the fresh terminal takes focus without a
  synthetic DOM focus call, each character reaches a real PTY in order, 12
  burst commands pass, Backspace corrects a command, and Shift+Tab reaches the
  PTY as Escape `[ Z`.
- Keep the Linux AppImage and Debian packages on the identical verified
  frontend archive. Verify each Tauri minisign signature, SHA-256 and remote
  byte count. Probe both old-client feeds for 0.8.6 and both current-version
  feeds for 204 after Railway finishes redeployment.
- No backend redeploy is required: 0.8.5 backend API changes are already live.
  This is a Linux client-only correction; Mac users already had the notice and
  terminal focus behavior.

Publication results are appended after the final signed packages pass.
