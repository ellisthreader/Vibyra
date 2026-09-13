# Release 0.6.3

Published 8 September 2026: Agent teammate forms, reliable save retries and
daily/weekday routine wire compatibility. Source
`99ec76c895430d63fc09c776b0906d432eb15e49`, tag `v0.6.3`, branch
`release/0.6.3`; signed CI run `34225371322` passed all five jobs.
The reviewed 0.6.2 candidate was never advertised and is superseded.

Railway deployment `87b5c9e2-ccb4-42db-a935-05bf2930a23a` reused the
existing backend image with new release metadata. The live feed at
`https://vibyra-production.up.railway.app/web-api/releases` serves 0.6.3 for
Windows NSIS, Linux AppImage and Debian. All 36 updater/version cases passed;
public binary sizes, hashes and feed signatures match the signed CI set.
A real isolated 0.6.1 AppImage upgraded and relaunched into 0.6.3 successfully.
The local stable launcher was atomically replaced without closing user work.

Native signed Debian acceptance covered restored teammates/chats, weekday
schedule editing while paused, automatic scheduled execution with saved brief,
memory and skill context, and denying a file overwrite without changing it.
Real Claude and Codex context checks passed. Native acceptance used isolated
user data and a loopback account fixture; provider calls and IPC were real.
Windows installer/launch passed CI, but interactive provider acceptance was
Linux-only. macOS is not included. Routines require the desktop to be running.

Evidence and limits: `docs/releases/0.6.3-agent-publication.md` plus its adjacent
`0.6.3-agent/` evidence directory. Release branch source is authoritative;
do not release the stale original worktree or overwrite unrelated dirty work.
The routine wire regression procedure is in the VibyraOptimse skill; see
[[Agent Mode Audit Boundaries]]. Publication means available, not installed on
every user's machine. Recheck the live feed before a later release.
