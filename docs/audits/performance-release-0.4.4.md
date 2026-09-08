# Vibyra 0.4.4 performance release

Published 5 September 2026. Windows, Linux AppImage and Debian packages are live;
the stable local AppImage was atomically updated, with the previous 0.4.3 file
retained for rollback. No existing desktop session was forcibly restarted.
Mobile changes are committed and exported for web validation, but no phone build
was installed or distributed.

## Release identity and deployment

- Signed desktop source: `7a00633`, tag `v0.4.4`.
- All package gates, signatures, installation/launch checks and complete release-set
  verification passed in [Actions run 33972227791](https://github.com/ellisthreader/Vibyra/actions/runs/33972227791).
- Backend source: `cc8f57f`; final successful Railway deployment:
  `8af52660-07c6-48f2-a805-a3c56d2d1ab4`.
- Initial runtime rollout: `53f735eb-6006-4e3e-8ae3-ddfe37175aa9`.
- Public downloads were fetched in full and matched all three published hashes.
  Old updater clients receive signed updates; current/future clients receive 204.
- The original dirty 0.2.8 audit checkout was preserved. This release was ported
  onto the live 0.4.3 code, retaining Agent and Chat functionality.

## What changed and what was verified

Mobile persistence coalesces snapshots before normalization and retains credential
barriers. Negotiated cloud deltas reduce repeated transfers and preserve remote
state on conflicts and acknowledgement loss. Existing full-state clients remain
supported. No database migration was introduced.

Native terminal admission now bounds pending input to 4 MiB and 1,025 messages,
including the write in progress; rejected input produces mandatory visible feedback.
Watcher queues and batches are bounded. Windows uses a recursive root handle so
nested watches cannot prevent a source-folder rename, with generated events filtered
before queue admission. Other platforms prune generated trees at registration.
Pruning already shipped in 0.4.3; the old audit's watcher-count reduction is not
an incremental gain from this release. Dictation owns and cleans up its capture
process and temporary audio, with a 120-second limit.

The actual Nixpacks image passed streaming, auth-header, POST, static-file and
blocked-path checks, plus authenticated Laravel save/delta/replay/conflict checks
using isolated SQLite. Twelve ordinary requests finished in about 2.8-3.4 ms each
while a two-second stream remained open. These are local fixture measurements.
Live checks confirmed the deployed source hashes, health, unauthenticated rejection,
blocked hidden/PHP paths and the updater/download contracts.

Live inspection found Nginx auto-starting 48 workers from the host CPU count despite
an eight-CPU quota. The final configuration defaults to two workers (override:
`VIBYRA_NGINX_WORKERS=1..16`); the final live process count is two workers plus
one master. This adjustment passed the same streaming fixture in the built image.
PHP-FPM remains bounded to four workers by default. Four long PHP requests can
still occupy the whole pool. `VIBYRA_WEB_SERVER=legacy` preserves a web-server
rollback path; previous source, release metadata and installers were retained.

Validation: 154 mobile tests and mobile type/line checks; 391 backend tests with
2,459 assertions, four PHPUnit notices and one skip; canonical desktop checks on
all three package jobs; mobile web export; website build; Remotion typecheck;
18 repaired PNGs verified and fully decoded. Compatible dependency updates cleared
the backend Composer/npm and desktop npm audits. A local timing-sensitive native test failed
under host contention and passed its isolated rerun; signed-package CI passed.

## Physical Linux checks and limits

The signed 0.4.3 and 0.4.4 AppImages were launched on the actual Intel i7-6700K Linux
PC and display, using separate profiles and private D-Bus sessions. The normal
0.4.4 AppImage launch was also verified before replacing the installed file.
Four alternating A/B/B/A sign-in-screen runs recorded startup, CPU and RSS. Warm
visibility timings were about 1.82 seconds for both versions; other starts took
about 5.7 seconds. CPU varied substantially, and the initial host was heavily
limited by disk I/O. The alternating runs used extraction mode and private-session
setup, so they are not direct measurements of an ordinary signed-in cold start.

The signed packages subsequently completed real password sign-in against the
isolated Laravel fixture, first welcome, project opening and native shell launch.
Private-keyring persistence failed, but the native account manager correctly
adopted the verified session in memory. Two ordinary-display attempts exited
normally before sign-in could be completed; their cause was not established.
The successful workspace checks used a Xephyr nested X11 display on this PC,
separate XDG profiles and private D-Bus sessions. This is native packaged execution
on the physical CPU, but does not establish normal GNOME compositor performance.

Each completed run typed ten exact 127-character lines, pasted 2,006 characters,
printed 5,000 lines and accepted another exact input afterward. All main-workload
input readbacks passed. Terminal rendering through the final output marker was
visually inspected. No provider account, paid AI request or real project was used.

| Signed package/run | Idle CPU, one core | Native/WebKit RSS | 127-character injection-to-PTY median |
| --- | ---: | ---: | ---: |
| 0.4.4, first | 2.59% | 581.6 MiB | 348.5 ms |
| 0.4.3 | 2.59% | 585.9 MiB | 248.1 ms |
| 0.4.4, repeat | 3.38% | 587.7 MiB | 240.7 ms |

CPU samples lasted 15 seconds after settling and exclude the nested X server.
Typing timings include injecting the entire string with xdotool, scheduling and
PTY line completion; they are **not key-to-paint latency**. Other jobs ran on the
host. The later two runs used a process-local unavailable external proxy, with
loopback exempted, to prevent 0.4.3 automatically upgrading before its benchmark.
The app's explicit offline-update continuation was exercised. The variation does
not support a terminal speed-up or regression percentage.

The main paste test allows 500 ms for asynchronous clipboard acquisition before
Enter. An earlier 0.4.4 cold-paste trial with immediate Enter delivered an empty
line first, then the exact paste after another Enter. Five warm immediate-paste
trials on 0.4.3 did not reproduce it. The clipboard handler is unchanged between
the releases; attribution remains unresolved, and the waiting main test does not
clear this edge case. The candidate PTY environment contained no stale AppImage
mount paths in the inspected path variables, although the extraction-mode flag
remained inherited.

No reliable overall performance percentage is established. Large workspaces,
multi-pane key-to-paint latency, microphone hardware and a physical phone remain
unmeasured. A connected phone and configured native mobile build are still
required for phone measurements.

## Measured cloud-save workload

The actual mobile cloud transport and real Laravel/Nixpacks SQLite fixture were
used for three alternating full-save/delta pairs at each size. Each synthetic
thread held 80 messages with 2,000 characters each; one existing message changed.
Every save was read back and compared with the complete expected app state.

| Histories | Legacy request + response bytes | Delta request + response bytes | Body-byte reduction | Median full / delta client time |
| --- | ---: | ---: | ---: | ---: |
| 1 | 332,211 | 4,286 | 98.71% | 231.5 / 207.3 ms |
| 10 | 3,245,277 | 4,286 | 99.87% | 367.1 / 240.4 ms |
| 40 | 12,955,557 | 4,286 | 99.97% | 712.4 / 340.5 ms |

These are uncompressed HTTP body bytes, excluding headers and TLS. The delta
contains both the exact old/new text and an identity guard; its acknowledgement
is 27 bytes. Initial full synchronization is excluded from this per-edit table.
Latency is a small local-loopback sample under concurrent workloads, not a
production estimate. Insertion/deletion of message arrays remains atomic and can
send substantially larger changes. Backend storage still rewrites the JSON state.
The server supports this protocol in production, but the mobile client has not
been installed on a phone; these are not delivered phone-performance results.

## Next performance work

1. Reproduce the cold clipboard/Enter ordering case with controlled clipboard
   completion before changing terminal input ordering. Do not count a delayed
   test submission as a fix.
2. Measure native key-to-paint latency and multi-pane rendering in a quiet normal
   desktop session; distinguish input injection time from renderer latency.
3. Install a configured native mobile build on the selected phone and compare
   scrolling, typing and sync under the same histories and network conditions.
4. Profile large-state database serialization before considering a schema change.
   Tiny deltas reduce transfer, but do not eliminate whole-state storage work.
   Keep worker counts bounded; greater concurrency alone is not a measured fix.

The overall Security CI remains red for inherited mobile tooling advisories and
150 historical secret-scan findings, including test fixtures and old browser-profile
files. No history exclusions were added and those findings are not declared clean.
The backend job and repository-policy job pass. These open findings prevent any
claim of a completely clean whole-software audit.

Evidence: [release receipts and measurements](performance-release-0.4.4-evidence/).
