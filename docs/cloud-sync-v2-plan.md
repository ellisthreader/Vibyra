# Vibyra Cloud sync v2 — plan (2026-10-06)

Goal: a project ticked for Cloud reaches Cloud on its own, every screen says the truth about where it is,
and nobody ever needs to wake Cloud, disconnect, or reconnect to make it move.

## What is broken today (diagnosis, 4 agents + live logs, user 57)

1. **Uploads never wake Cloud, and Cloud stops 300 s after waking even with work pending.** `SyncBlobs::receive`
   never calls Wake; `Idle::stopReason` only counts Host work. Live: woke 19:32:53, applied hke 19:35:43,
   stopped 19:37:53 while the Mac had just granted another project. → "I have to keep waking the cloud".
2. **"Sending from your Mac…" is a guess.** Server `pending` means four things (ticked-not-sent, uploading,
   uploaded-awaiting-Cloud, applying). Phone maps all of them to "Sending". A finished upload with Cloud asleep says
   "Sending" forever; a paused/quit Mac also says "Sending".
3. **The Mac stalls silently.** Paused by side doors (iPhone approval dialog — fixed b201ffb1 — remove-all,
   `set_options({enabled:false})`); a paused Mac makes no requests so nobody can see it; `connect_required`
   counted as a project failure → backoff up to 900 s that survives reconnect; Mac never re-registers after the
   server forgets it; missing VM key = endless "Syncing…".
4. **Disconnect is the only "retry" and it erases everything** (disk, VM key, Macs, ticks, uploads). Double taps
   sent DELETE/POST twice. Rate limits are per IP (phone + Mac share one bucket).
5. **Cloud-side failures are silent or raw codes**; removed projects keep the VM "applying" every 5 s for a day;
   stop SIGKILLs an apply in progress; "diverged" reported as success.

## Target design

**The server owns one status per ticked project. Phone and Mac only display it, with the same words.**
**The server decides when Cloud is awake.** **The Mac reports what it is doing.** **Repair, never Disconnect.**

### Contract (backend implements; Mac, phone, VM consume — keep names exact)

1. `GET /api/cloud-computer/access` → each `projects[].cloud` gains
   `status: { phase, sent?, total?, syncedAt?, appliedAt?, code?, message?, fixOn?, bytes?, limitBytes? }`,
   `phase` ∈ `waiting_mac | mac_paused | waiting_cloud | preparing | uploading | saved | applying | ready | diverged | skipped | needs_attention`.
   Derivation (first match wins):
   - `skipped` row state → `skipped` (code = reason, e.g. `too_large`; bytes, limitBytes)
   - `error` row state → `needs_attention` (code = reason; plain `message`; `fixOn` mac|cloud)
   - `diverged` → `diverged`
   - fresh Mac report (≤ 45 s) says it is uploading this projectKey → `uploading` (sent, total)
   - no row / `upSeq = 0` / `reason = needs_full`: Mac report fresh & paused → `mac_paused`; no VM key → `waiting_cloud`;
     Mac fresh → `preparing`; else → `waiting_mac`
   - `upSeq > upAppliedSeq` (or transcripts seq ahead): VM applying → `applying`; else → `saved`
   - else → `ready` (appliedAt)
   `macs[]` entries gain `state: syncing|idle|paused|error|offline` (offline = no report/check-in for 2 min),
   `current: {projectKey, sent, total}|null`, `lastError: {code,message}|null`, `reportedAt`.
2. `PUT /api/cloud-computer/sync/macs/{deviceId}/status` (Mac, bearer, eligible; **no** consent needed — a paused Mac
   must be able to say so). Body `{paused, gate, current: {projectKey, kind, sent, total}|null,
   projects: [{projectKey, phase: queued|preparing|uploading|done|error, code?, message?}]}`. Also counts as a
   check-in. Unknown device → 404 `mac_unknown` (Mac re-registers when the account is connected).
3. `GET /api/cloud-computer/sync` gains `connected: bool` (account agreement current).
4. `POST /api/cloud-computer/sync/repair` `{projectKey?}` → non-destructive: sets `resync` on the project(s), clears a
   failed/needs_full state, wakes Cloud for sync. Phone "Sync again" uses it. Idempotent, per-account rate limit.
5. VM `POST sync/status` may carry `{applying, keyOk, lastError: {code, message, project?}}`; per-item failures use a fixed
   code set: `key_mismatch` (→ server sets resync, never an error to the user), `download_failed`, `verify_failed`,
   `disk_full`, `apply_failed`, `diverged`.

### Server behaviour
- `Wake::forSync(user)`: system wake with no phone session; debounced (≥ 2 min), checks agreement, eligibility, allowance,
  start caps; no-op if running/starting. Called when an up blob (code or transcripts) or a login is committed, on repair,
  and when the Mac reports/checks in with ticked projects while the VM key is missing.
- Idle stop never fires while `pendingCount > 0`, an apply is fresh, or a Mac reports an upload in flight for this
  account (bounded: give up after 30 min with no progress). Sync status/applied refresh activity. Then 300 s tail.
- Disconnect stays the explicit "delete my Cloud copy": idempotent (second DELETE is a no-op), never offered as a fix.
- Per-account (bearer-hash) rate limiters for cloud-computer reads, connect, wake, repair — in AppServiceProvider.
- `SyncQueue::pending` returns only unseen removals; incrementals skipped for needs_full set `reason=needs_full`.

### Labels (phone and Mac identical)
| phase | line | detail / action |
|---|---|---|
| waiting_mac | Waiting for your Mac | Open Vibyra on your Mac · last seen X |
| mac_paused | Paused on your Mac | Turn it back on in Vibyra → Settings → Cloud |
| waiting_cloud | Starting Vibyra Cloud… | first start makes its lock; takes about a minute |
| preparing | Getting ready on your Mac… | |
| uploading | Sending from your Mac · 42% | |
| saved | Saved · opening in Cloud soon | (counts as safe; Cloud wakes itself) |
| applying | Opening in Cloud… | |
| ready | Ready · updated 2 min ago | |
| diverged | Ready · Cloud has its own edits | review on the Mac |
| skipped | Too big for Cloud · 3.5 GB of 500 MB | |
| needs_attention | server `message` | **Sync again** (repair) |
| (live session) | Running in Cloud | |

## Workstreams (one agent each; each first reviews this plan for its part, then implements + tests)

- **A Backend** — `~/Desktop/Vibyra-prod-cloudfix-20261006/backend`, new branch `fix/cloud-sync-v2-20261006` from ee5aa5e9.
  Contract 1–5, Wake::forSync, Idle, repair, idempotent disconnect, limiters, SyncQueue fixes, migration for Mac status
  columns, update docs/cloud-sync-contract.md + cloud-access-contract.md, feature tests (`--filter`, never the bare suite).
  **No push.**
- **B Cloud computer** — `~/Desktop/Vibyra/cloud-runtime` (untracked; copy to `~/Desktop/Vibyra-cloud-runtime-backup-20261006`
  first). Fixed failure codes + lastError/keyOk in status; status(applying) only when there are items; graceful stop waits
  for the current apply (bounded); `key_mismatch` reported; removal errors not swallowed. node tests pass. **No image build.**
- **C Mac** — `~/Desktop/Vibyra-mac-cloud-20261006`, branch feat/mac-cloud-tab-20261006. Account agreement is the only
  consent; `connect_required`/`not_eligible` are gate states (and reset backoff when the account changes); re-register when
  `macs` lacks this device; Pause only by the user (remove-all/set_options/migration never pause); status report every 15 s
  while active, 60 s when idle/paused; upload progress per 8 MiB part; transcripts errors separate; POST project only when
  new/missing; drop stale local state for projects the server lost; Cloud tab rows use `status.phase` + the label table
  (fallback to old fields). cargo tests (CLT SDKROOT env), tsc, node tests. **No signed build/install.**
- **D Phone** — `~/Desktop/Vibyra/mobile` (shared with peers: re-read before each edit, never stash). Rows from
  `status.phase` + label table (fallback for an older server); "Sync again" on needs_attention; Disconnect moved behind a
  second step ("Delete everything in Cloud…") with busy guards on connect/disconnect/wake; no manual-wake nudges when
  Cloud wakes itself; poll 3 s only while uploading/applying/waiting_cloud, else 15 s; connect flow lands when every pick is
  `saved` or better. tests + `npx tsc --noEmit`. Simulator only, never the physical iPhone.

## Release (owner approves each step)
1. Backend push to `railway-production`. 2. Overlay VM image + `CLOUD_WORKSPACES_IMAGE`. 3. Mac preview via `npm run app:dev`,
then a build. 4. Phone on the Simulator, then the iPhone build when the owner says.
Later (not in v2): reuse a stopped Fly machine for 2 s wakes; one VM poll loop driven by the heartbeat reply.
