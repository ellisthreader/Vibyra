# Read-only live runtime diagnosis — 2026-10-01 15:05 UTC

The repeated `Failed to poll event` message is not sufficient evidence for the user's intermittent 502. Production runs PHP 8.3.15. The official [PHP 8.3.27 changelog](https://www.php.net/ChangeLog-8.php#8.3.27) explicitly fixes useless EAGAIN logging with PHP_CLI_SERVER_WORKERS. The observed pattern—many idle sibling workers logging together on a connection—is consistent with that known race/noise, not a proven application crash. The PHP manual also says its built-in multiworker server is experimental and [not intended for production](https://www.php.net/features.commandline.webserver.php).

Bounded observations from successful deployment 71575721 (e16bcd3):
- 100 saved log rows over 15:02:53–15:03:32 UTC contained 50 poll errors. No true `[500]`/`[502]`/`[503]` HTTP status or fatal/memory/execution-time message in that sample. This sample is too small to exclude historical failures.
- SSH process snapshot: master plus eight web children alive, sleeping, approximately 12 minutes uptime; scheduler and three queue workers also present.
- Container memory 311,304,192 bytes of 8,000,000,000; memory.events oom/oom_kill/max all zero. CPU throttling zero. No evidence of current memory/CPU exhaustion.
- Six sequential, ordinary live GETs completed in 59–195ms: /up returned 200, homepage/downloads returned expected 403 human challenge. A mistaken /api/downloads route returned 405. No timeout/502 reproduced; this was not a load test.

A PHP runtime update to a maintained patch release removes this known log defect, but cannot honestly be claimed to fix the unexplained 502. Correlate the next failure's timestamp/request ID with Railway edge timing and app logs before attributing it. The same shared PHP worker pool still admits a concrete starvation risk from concurrent long streamed requests; no saturation was reproduced live.

## Existing FPM option and deployment constraints

Main has optional nginx + PHP-FPM with separate general/control pools, controlled by VIBYRA_WEB_SERVER=fpm. Its local integration test passes using the installed Homebrew nginx/php-fpm binaries: streamed first event is unbuffered, control endpoints stay responsive while the single general worker is occupied, headers/body/query/auth are forwarded correctly, dotfiles and direct PHP are blocked. Runtime identity/write-probe tests also pass (3 tests total). This is evidence for the local implementation only.

Current production has php-fpm but no nginx; candidate nixpacks does not install nginx. Main implementation also requires an existing non-root user/group with write access to runtime directories; startup correctly refuses root defaults. Its nginx-owned static responses currently lack the new browser security headers. Therefore switching a production env flag alone is not a safe fix. A separate reviewed image change must package nginx + a current PHP runtime, provision a non-root worker identity/runtime ownership, port static headers, test the complete image and both pools, then deploy under the parent's process. Active Vibyra-web uses a different FPM launcher (including root-permitted mode); that architecture was preserved rather than copied into the candidate blindly.

## Scoped source ports completed

Main: copied reviewed production-router.php; changed only builtin router path in start-production.sh, preserving optional FPM branch; updated launcher tests. Candidate and main launcher tests each pass 4/4. Fixed pre-existing all-role test race by waiting for all mocked children before cleanup, ensuring the web command was captured.

Active Vibyra-web: copied the same reviewed router and hardened only explicit legacy rollback in start-production-web.sh (expose_php=0, eight configurable workers, direct router); kept default FPM and post limit 48M. Shell/PHP syntax checks pass. Backups are private source-only files under /private/tmp/vibyra-web-server-port-20261001-160545 and /private/tmp/vibyra-website-legacy-router-20261001-160639. No deployment, dependency change, production mutation, or main commit occurred.
