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

## Release acceptance and publication

- Signed release workflow `35988720626` passed Linux and both Mac package jobs;
  the AppImage smoke screenshot confirms the same new-model design. The native
  test verified Linux notice visibility, natural terminal focus,
  24 per-character PTY echoes, 12 burst commands, Backspace and Shift+Tab
  (`ESC[Z`). The workflow's Windows job failed its separate Rust suite on
  Unix-path, `/bin/sh` and newline assumptions; no Windows update was released.
- Both Linux packages use frontend SHA-256
  `0922fa5e03045f7c74d49dbfa3e664c182f39a81b5ebdcfef679512eb75fc0b6`.
  The 109,369,848-byte AppImage SHA-256 is
  `8092afe7af028fe3d31bdee8e187949f088a0a7452eeed2929739e9d8447bc3e`; the
  21,093,408-byte Debian package SHA-256 is
  `66d9095017b4b8589b1cb2e63b5f79e68e2d7e4049cb52dbb02e496e8d4a89cb`.
  Both Tauri signatures, sidecar checksums, shared manifests, and remote
  volume byte counts were verified.
- Railway production feeds offer 0.8.6 from clients on 0.8.5 and 0.8.2 for
  both AppImage and Debian; clients already on 0.8.6 receive `204`. The direct
  Linux download routes serve the expected filenames and sizes. The existing
  backend image was redeployed with Linux release metadata; no backend source
  change was needed.
- Published tag `v0.8.6` at `11490e34e90228c1e6310d54ccad0078fe555c3a` with
  all eight Linux assets:
  https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.6.

Publication results are appended after the final signed packages pass.
