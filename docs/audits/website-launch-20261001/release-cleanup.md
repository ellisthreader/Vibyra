# Release-volume capacity repair — 2026-10-01

The six locally archived Linux installers 0.1.6–0.1.11 were conditionally removed from the existing Railway release volume at 18:44:01 UTC. Every local and remote copy was rechecked for exact byte count and SHA-256, and none appeared in the current live download configuration, public release catalogue or updater feeds. The deletion process repeated path, live-reference, size, hash and file-stat checks immediately before each exact unlink. No recursive deletion was used.

The protected recovery copies remain in `/Users/ellis/Desktop/Vibyra-release-archive-20261001/`, with `verified-manifest.json`, original paths/hashes and `RESTORE.md`. Six files total 593,107,920 bytes. Do not remove this local archive: it is now the retained copy of these obsolete installers, not a database backup.

Free bytes rose from 67,297,280 to 660,414,464. Post-operation `df -m` reports 630 MiB available and 87% usage. Inventory fell from 109 to 103 files with no other preexisting file's size/mtime/inode changed. All other versions and nested release directories were preserved. All seven current public download/updater URLs on vibyra.net returned HEAD 200 with expected filenames and Content-Length. This confirms current serving availability, not an installer execution test.

See `release-cleanup-result.json` for exact outcomes. The existing 5 GB allocation was retained. No plan, payment or database-backup changes occurred; provider billing/workspace resolution remains separate.
