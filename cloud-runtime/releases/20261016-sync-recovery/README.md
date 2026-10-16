# Full resend recovery overlay — 16 October 2026

Build this directory with the included Fly config. The immutable base is the deployed 40eca3 image; all 43 runtime source files are checked before replacing only sync-snapshot.mjs. Login, Host, Preview, binaries, entrypoint and environment are inherited unchanged. The result must be referred to by its immutable registry digest, never only the tag.

This fixes the actual packaged consumer of downNeedFull/transcriptsNeedFull. Pair with the SyncQueue needFull acknowledgement/state and SyncRetention changes in this commit. Existing five-minute transcript passes recover unchanged code; successful full resends have a ten-minute cooldown. Partial recipient failures do not advance local sent state. Conversations retain the existing five-session-per-provider eligibility window.

Validation: 57 SQLite tests/863 assertions; 25 PostgreSQL tests/462 assertions (22 repeated cases and 3 independent acknowledgement races); 93 exact-lineage runtime tests plus 2 independent adversarial tests. Runtime build and private-machine receipts live in the dated Cloud repair report. No new handover/flush/Preview capability is enabled. This is a narrow production-lineage overlay; do not substitute an unrelated root checkout's Dockerfile.

The three files in `tests/` are the exact reviewed recovery fixtures (the peer fixture only has import paths normalized). Run them against the built image by creating a disposable QA directory whose `src` symlink targets `/opt/vibyra/src` and whose `tests` directory contains these files; execute `node --test --test-concurrency=1 tests/*.test.mjs` as uid 1001. Tests use local HTTP fixtures and temporary Git homes, with no production credentials or user projects. They are excluded from the production build context.
