# Linux Memory Pressure And Storage

For whole-PC lag or Vibyra disappearing, check host pressure before changing
terminal rendering. A healthy `free -h` sample after an app exits can hide the
incident: inspect `journalctl -u systemd-oomd -b` as well as kernel OOM logs.

On 2026-09-04, systemd-oomd repeatedly killed `app-gnome-vibyra-*.scope`;
confirmed events include 16:59, 18:10, and 21:50 local time. The last scope
used 13.3G, with user-session memory pressure above its threshold for over
20 seconds. This is application-group usage, including descendants, not proof
that the native app or WebKit alone leaked. Attribute memory to the app,
WebKit, provider agents, and build children during a live recurrence.

The seven-day review ending 2026-09-04 22:05 BST found 27 oomd kills, all
Vibyra application scopes: Sep 1 = 4, Sep 2 = 3, Sep 3 = 8, Sep 4 = 12.
Large scope snapshots were 12.1–13.8G. Historical `/var/log/sysstat/saDD`
samples also prove an independent HDD bottleneck: on Sep 3, intervals ending
15:50–16:10 BST had 82–87% CPU iowait and 91–93% HDD utilization while
about 9.6 GiB RAM remained available, swap traffic was negligible, and the
SSD was idle. Do not explain all lag as RAM exhaustion. `sadf -d` timestamps
default to UTC; convert to the user's timezone and distinguish interval
averages from instantaneous readings. These files do not identify historical
per-process I/O ownership; use a live `pidstat -d` sample for attribution.

The system filesystem is on mechanical `/dev/sda7`; the SSD is mounted at
`/mnt/nvme`, including active swap at `/mnt/nvme/current-swap.img`. Rediscover
mounts and capacity each time. Neither mounted internal filesystem was full
at the start of this incident's cleanup. HDD SMART reported no failing
attributes or bad sectors; this does not rule out every hardware problem.

Large regenerable Rust output accumulated in
`/mnt/nvme/home/ellis/Current-PC-Builds/cargo-target` (104 GiB before cleanup).
Preserve installed binaries, shared libraries, source, databases, and current
builds. Old compiler objects, contract-test executables, and incremental
caches can be rebuilt; check running compiler/test processes before cleanup.
Removal increases later build time and does not resolve application memory
pressure. Run metadata-heavy disk scans sparingly and remeasure I/O after
scanning/cleanup ends; the diagnostic itself can saturate the HDD.

The host-pressure check is also recorded in the desktop reliability section
of `.agents/skills/VibyraOptimse/SKILL.md`.

## Workstation build defaults (2026-09-04)

- `~/.npmrc` now sets `cache=/mnt/nvme/home/ellis/Current-PC-Caches/npm`;
  the existing npm prefix is preserved. Original config:
  `~/.npmrc.before-ssd-cache-20260904`.
- The shared Cargo config at `/mnt/nvme/home/ellis/.cargo/config.toml`
  defaults to two jobs, retaining its SSD target directory. Command-line
  flags and environment can override it. Original config is alongside it as
  `config.toml.before-pc-tuning-20260904`.
- HKE commands were explicitly setting
  `CARGO_TARGET_DIR=/home/ellis/.hke-desktop/cargo-target`, overriding the
  shared SSD target. Check the actual filesystem with `findmnt -T`, not just
  the global Cargo config, when diagnosing a build's I/O.
- The HKE path above now symlinks to
  `/mnt/nvme/home/ellis/Current-PC-Builds/hke-desktop-cargo-target` (about
  19 GiB migrated). The target in worktree `vibyra-1a062ef22f2-0` also links
  to `/mnt/nvme/home/ellis/Current-PC-Builds/vibyra-1a062ef22f2-0-target`.
  Both copies were compared after their builders released the source caches;
  HKE's release backend checksum matched. Root permissions on the SSD copies
  are restricted to the user. Preserve these links: replacing them with
  ordinary directories can silently put future build I/O back on the HDD.
  Verified HDD duplicates were removed; the complete cache data remains on SSD.
  Future worktrees can create new HDD targets; verify their actual target
  filesystem rather than assuming these two migrations cover all worktrees.
- GNOME Tracker's ignored-directory list now additionally excludes
  `node_modules`, `target`, `vendor`, and `__pycache__`, avoiding desktop-search
  indexing of dependencies/build churn. The prior list was
  `['po', 'CVS', 'core-dumps', 'lost+found']`; restore it with `gsettings set
  org.freedesktop.Tracker3.Miner.Files ignored-directories` if needed. This
  setting does not control editor/project search.
