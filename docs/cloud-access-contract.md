# Cloud access contract (what Vibyra Cloud may use) — 2026-10-04

Owner decision 2026-10-04: **nothing syncs until the person ticks it.** The Connect page lists the connected Mac's
projects with ticks (the project they are working in is pre-ticked, the rest unticked). A project created later waits
for a tick on the phone. Unticking deletes the cloud copy. Parent docs: `docs/cloud-sync-contract.md`,
`docs/cloud-computer-contract.md`. Audit and rationale: `Vibyra/_ai/Runs/2026-10-04 Cloud Product Audit.md`.

Rules for every worker: same as the sync contract (new behaviour in NEW small files, 200-line standard; re-read a file
right before each targeted edit — peers edit this checkout; never `git stash`; backend tests one file or `--filter`
with `php -d memory_limit=1G vendor/bin/phpunit --colors=never <file>`; Cargo env from the sync contract; format only
leaf Rust files you edited; no deploys; never claim real Fly/phone behaviour). Do not touch files another worker owns.

## Ownership (disjoint)

| Worker | Owns |
|---|---|
| backend | `backend/app/Services/CloudComputer/Access*`, `backend/app/Http/Controllers/CloudComputer/Access*`, new migration `2026_10_04_3*`, additions to `routes/cloud_computer.php`, `SyncProjects::grant` refusal, `SyncLogins::receive` refusal, `ConnectController` (projects field), `Computers::payload`/`SyncState` additions, `config/cloud_workspaces.php` (consent version default → 3), `backend/tests/Feature/CloudComputer/Access*` |
| mac | `desktop-tauri/**` (cloud sync wiring, project menu switch, returned-conversation notice) |
| runtime | `cloud-runtime/**` (manifest `ranIn`), `host/crates/engine/**` (agent session id on session summaries, one live resume per conversation) |
| phone-settings | `mobile/src/cloud/**` EXCEPT `continueInCloud.ts`, `useComputerAway.ts`; plus `mobile/tests/cloud*`, `mobile/scripts/verify-cloud-*` |
| phone-location (lead) | `mobile/src/ui/ComputersScreen.tsx`, `ui/hostStatus.ts`, `ui/hostIdentity.ts`, `ui/HomeProjects.tsx`, new `mobile/src/location/**`, `state/remoteActions.ts`, `state/connection.ts` saved-Mac additions only (coordinate: peer vibyra-99 owns `state/{appLifecycle,autoConnect,workspaceNotices,WorkspaceStore,types,liveness}.ts`) |

## Identities

- A Mac project is named by its Mac project id (`project.id` as the Mac reports it to the phone in `host.state.projects[].id`,
  and as the Mac sync engine hashes it). `projectKey = substr(sha256("vibyra-project:" + id), 0, 32)` (unchanged).
  The phone sends the Mac project id; the **server** derives the key (the phone never hashes).

## Backend API (user bearer, prefix `/api/cloud-computer`; throttles as the group)

### `GET /access`
```json
{ "ok": true,
  "projects": [ { "projectKey": "…32hex", "name": "Vibyra iOS", "allowed": true, "decidedAt": "iso", "source": "phone|mac",
                  "cloud": { "state": "pending|synced|diverged|skipped|error|null", "syncedAt": "iso|null", "bytes": 0 } } ],
  "providers": { "codex": { "enabled": true, "carryOver": "allowed|blocked", "sent": true, "appliedAt": "iso|null" },
                 "claude": { "enabled": true, "carryOver": "unsupported" } },
  "integrations": { "github": { "enabled": true } },
  "capacity": { "computers": { "used": 0|1, "limit": 1 },
                "hours": { "allowanceSeconds": 0, "usedSeconds": 0, "resetsAt": "iso|null", "overage": "tokens|blocked" },
                "storage": { "usedBytes": 0, "limitBytes": 5368709120 },
                "sessions": { "active": 0, "limit": null },
                "idleStopSeconds": 300, "maxSessionSeconds": 28800, "projectLimit": 100 } }
```
- `projects` = every decided row plus every `cloud_sync_projects` row (a row with no decision is `allowed:false`,
  except rows grandfathered by the migration). Ordered by name.
- `capacity` values are read from the EXISTING config/services (`Hours`, `SyncRetention`, `Computers`, `cloud_workspaces.*`,
  `Projects` cap). `sessions.limit` is `null` because no concurrency limit exists today — do NOT invent one.
  `hours.allowanceSeconds == 0` with Pro means "no included hours configured" (`CLOUD_INCLUDED_HOURS_PRO` unset).

### `PUT /access/projects` (30/min)
Body `{ "projects": [ { "id": "<mac project id>", "name": "Vibyra iOS", "allowed": true } ] }` (1..100 items;
`projectKey` may be sent instead of `id` for a row the phone got from `GET /access`). Upserts `cloud_project_access`
(`user_id`, `project_key`, `name`, `allowed`, `source='phone'`, timestamps). For `allowed:false` with a live
`cloud_sync_projects` row: run `SyncProjects::remove` (blobs dropped, tombstone, VM deletes the folder). Needs
`ConnectConsent::connected` (409 `connect_required` otherwise) and `Eligibility` (`SyncGuards::eligible`). Reply = `GET /access`.

### `PUT /access/providers/codex` (30/min)
Body `{ "carryOver": "allowed|blocked" }`. Stored per account (default `allowed` — the Mac's own opt-in switch is still
needed to send anything). `blocked` deletes any pending login blob (`SyncLogins::remove`). Reply = `GET /access`.
Signing the cloud computer out of Codex/Claude is done by the phone over the Host (`aiAccounts.disconnect`), not here.

### Accounts: Claude, Codex, GitHub (2026-10-05, owner decision: unticking is enforced by Cloud)
Per-account switches in `cloud_access_settings` (`claude_enabled`, `codex_enabled`, `github_enabled`, default **on**; no row = all on;
migration `2026_10_05_300000`). Service `AccessProviders`.
- `POST /connect` optional `accounts: {claude?, codex?, github?}` (booleans; 422 `invalid_request` before anything is kept). Keys
  left out are unchanged. **Codex off also sets `codex_carry_over=blocked`** (pending login dropped); Codex on leaves carry-over as is.
- `PUT /access/providers/claude` `{enabled: bool}`; `PUT /access/providers/codex` `{enabled?: bool, carryOver?: allowed|blocked}`
  (at least one); `PUT /access/integrations/github` `{enabled: bool}`. 30/min each, consent required (409 `connect_required`),
  reply = `GET /access`.
- **GitHub off** -> 403 `github_disabled` "GitHub is turned off for Vibyra Cloud. Turn it on in Cloud settings." from `GET /repos`,
  `POST /projects` with a `repo` (a plain folder still works), `POST /pull-request`, and the VM's `GET /api/cloud-runtime/{w}/git/credential`
  (queued clones fail, nothing can fetch or push). Gate: `Git\Repos::token` plus an audited early check in `Git\Credentials::mint`.
- **Claude/Codex off** -> `POST /api/cloud-runtime/{w}/host/activity` replies `{ok:true, disabledProviders:["claude"|"codex"...]}`
  (every 15 s, first one at Host start). The VM Host (`host/crates/engine/src/provider_policy.rs`) then drops them from
  `host.state.capabilities.conversationProviders` and refuses `session.create` (terminal or conversation), `session.resume`,
  `turn.submit` and `aiAccounts.connect|add|install|submit|signInUrl` for them ("Claude is turned off for Vibyra Cloud. Turn it on
  in Cloud settings."). Work already running is left to finish. A reply without the field (older server) changes nothing. Codex off
  also makes `PUT /sync/login/codex` 409 `login_blocked`. Limit: a plain shell terminal could still run the CLI by hand (a
  preference, not a sandbox). Takes effect only on a VM image with the new Host binary; until then the server only reports.
- Phone: `computerApi.connect(v, face, projects, accounts?)`, `setProviderEnabled(provider, enabled)`, `setGithubEnabled(enabled)`,
  `CloudAccess.accounts` (absent from an older server = treat all as on); fake `createFakeCloud({accounts})`.

### Enforcement (server wins)
- `POST /sync/projects` (Mac grant) for a key that is not `allowed`: **409 `project_not_allowed`** `{projectKey}`; no row
  is created or revived. Every `PUT …/up` and `…/up-part` for such a project: same 409. (`skipped` grants are allowed
  through so the Mac can report "too large" — they store nothing.)
- `PUT /sync/login/codex` while `carryOver == blocked`: **409 `login_blocked`**.
- `GET /sync` gains `access: { projectKeys: ["…allowed keys…"], codexCarryOver: "allowed|blocked" }` so the Mac can skip
  disallowed projects without a request per project.

### Connect
`POST /connect` accepts optional `projects: [{id, name}]` (≤100): recorded as `allowed:true, source:'phone'` in the
same request after consent is stored. Connect consent version default → **3** (the text now says "only the projects you
pick"). Bump `CLOUD_SYNC_CONSENT_VERSION`-dependent logic only if the Mac reads a version (the Mac accepts `>= 1`).

### State payload
`GET /api/cloud-computer` `computer.projects[]` gains `allowed: bool` (merged by name from `cloud_project_access`), and
the top level gains `capacity` (same object as `GET /access`). Existing keys unchanged.

### Migration
`cloud_project_access` table. **Grandfather**: every existing non-removed `cloud_sync_projects` row with `up_seq > 0`
gets `allowed:true, source:'mac'` so a working account keeps its projects.

## Mac (desktop-tauri)
- Worker: before syncing, read `GET /sync` `access.projectKeys`; sync only local projects whose key is in it (AND not in
  `disabled_project_ids`). Treat 409 `project_not_allowed` as "not chosen" (no error state, no retries until the next
  `GET /sync` shows it). New projects therefore wait for the phone tick.
- Project menu "Keep ready in the cloud": turning ON sends `PUT /access/projects {id,name,allowed:true}`; turning OFF
  sends `allowed:false` (server deletes the cloud copy) and adds to `disabled_project_ids`.
- Status/settings copy: "Only projects you pick are kept in Vibyra Cloud." List shows each project as
  `Only on this Mac` / `Waiting to sync` / `Ready in Vibyra Cloud`.
- Codex carry-over: when `access.codexCarryOver == blocked`, show the switch off with "Turned off from your iPhone".
- Returned conversations: `poll_down` already imports transcripts. Surface them: a banner/notice "N conversations
  continued in Vibyra Cloud" per project and, wherever a pane/saved card owns that `agentSessionId`, a subtle
  "☁ Ran in Vibyra Cloud" mark (from the manifest `ranIn` below, remembered in sync state per session id with
  `cloudAt`). A conversation that only exists from the cloud gets a "Continue on this Mac" action that opens a pane
  with `claude --resume <id>` / `codex resume <id>` in that project.

## Runtime (VM + Host)
- `cloud-runtime` return manifest entries gain `ranIn: "cloud"` and `cloudAt: <unix mtime of last VM append>`.
  (Claude `cwd` rewrite stays as is.)
- Host engine: session summaries (`session.list` / `host.state` sessions) gain `agentSessionId` (the provider uuid)
  when known, so the phone can merge a live terminal with its earlier conversation. `session.create {resume}` refuses
  a second running session for the same `(provider, id)` on this Host: returns the existing session id instead
  (`{sessionId, existing:true}`), never a second writer.

## Phone
- **Cloud settings sheet** (replaces `CloudOptionsSheet`): sections *Where it runs* (one line, read only),
  *Projects available to Cloud* (Mac projects from the connected Mac + `GET /access` rows; each row: tick + status
  `On your Mac only` / `Syncing…` / `Ready in Cloud` / `Running in Cloud`), *AI accounts Cloud can use* (Claude, Codex:
  signed in on Cloud or not, with Sign in / Sign out via Host `aiAccounts`; Codex "Use my Mac's Codex login" toggle =
  `carryOver`), *Cloud capacity* (hours left or "No included hours set", storage used, active sessions, "Stops after 5 min idle,
  8 h max"), then *Stop Vibyra Cloud* and *Disconnect Vibyra Cloud* (existing `DELETE /connect`, confirm).
- **Connect page**: project ticks before the consent box; sends `projects` with `POST /connect`.
- Words: "Vibyra Cloud", "Your Mac", "Running on your Mac", "Running in Vibyra Cloud", "Mac offline",
  "Continue in Cloud", "Switch back to Mac". Never "cloud computer", "Linux", "relay", "host" in visible copy.

## mac notes (2026-10-04)
- Worker: `desktop-tauri/src-tauri/src/cloud_sync_task/worker_access.rs`. Until the first account read of a session nothing is
  scheduled; a reply without `access` keeps the pre-contract behaviour. A `project_not_allowed` refusal (grant or upload) clears
  the project's error, ends the sync as OK and drops it until the next `GET /sync` (every 2 min, "Sync now", wake).
  `codexCarryOver: blocked` (or a 409 `login_blocked`) stops login sends with no error; allowed again sends at once.
- Project menu "Keep ready in the cloud" (`commands/cloud_sync_access.rs`): ON = `PUT /access/projects allowed:true` first
  (an error keeps the switch off; 404 = older server, the local switch alone), then the local switch and a sync. OFF = local
  switch off first, then `allowed:false`; on success the Mac forgets that project's sync state; a failure is reported
  ("Vibyra Cloud still has a copy"). The switch reads ON only when the project is switched on here AND ticked.
- Status: project `state` gains `notChosen`; Settings lines "Only on this Mac" / "Waiting to sync" / "Ready in Vibyra Cloud ·
  synced …". Codex `state` gains `blockedFromPhone`.
- Returned conversations: `vibyra-sync` `SessionMeta` reads optional `ranIn`/`cloudAt`; each written session with
  `ranIn` absent or `cloud` and a UUID id is kept in `ProjectState.returned` (newest 30, `cloudAt` falls back to mtime) with
  `returnedSeenAt`; status projects carry both; `cloud_sync_returned_seen {projectId}` marks them seen.
- Not changed: the Mac and Codex consent texts still say "cloud computer" (changing them needs a consent version bump).

## Sync v2 status (backend, 2026-10-06; docs/cloud-sync-v2-plan.md)
`GET /access` adds top-level `autoWake: true` (the server starts Cloud for synced work; never ask the person to wake it
for that) and, per ticked project, `cloud.status` (null when not ticked). The server owns it; phone and Mac only display
`phase` with the shared labels in the plan. First match wins:
1. row `skipped` → `{phase: skipped, code (too_large…), message, bytes (from the Mac report, else null), limitBytes}`
2. row `error` → `{phase: needs_attention, code, message, fixOn: cloud|mac|phone}` ("Sync again" = `POST sync/repair`)
3. row `diverged` → `diverged`
4. an online Mac reports `current` for this key (≤ 45 s) → `{phase: uploading, sent, total}`
5. an online Mac reports this project `error` → `needs_attention` with the Mac's code/message, `fixOn: mac`
6. no row, `upSeq 0`, or a resync with no full upload waiting: every online Mac paused → `mac_paused`; no VM key →
   `waiting_cloud`; a Mac online → `preparing`; else `waiting_mac`
7. uploads (code or conversations) not yet applied → `applying` while Cloud applies, else `saved`
8. else `ready`
Every status also carries `syncedAt` (last upload) and `appliedAt` (last apply) where they exist.
Codes and messages: apply_failed, download_failed, verify_failed, decrypt_failed, disk_full, quota_exceeded (fixOn phone),
too_large / no_files / upload_failed (fixOn mac), remove_failed; an unknown code reads as apply_failed.
`macs[]` adds `state: offline|paused|syncing|error|idle`, `current: {projectKey, kind, sent, total}|null`,
`lastError: {code, message}|null`, `reportedAt`.
