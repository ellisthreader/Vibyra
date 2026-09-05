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

No reliable overall performance percentage is established. These checks verify
packaged launch and sign-in rendering, not authenticated terminal input latency,
large-workspace behavior, microphone hardware or a physical phone. The attempted
isolated authenticated fixture hit secure-store setup problems; no signed-in
workspace success is claimed. A connected phone and a configured native mobile
build are still required for phone measurements.

The overall Security CI remains red for inherited mobile tooling advisories and
150 historical secret-scan findings, including test fixtures and old browser-profile
files. No history exclusions were added and those findings are not declared clean.
The backend job and repository-policy job pass. These open findings prevent any
claim of a completely clean whole-software audit.

Evidence: [release receipts and measurements](performance-release-0.4.4-evidence/).
