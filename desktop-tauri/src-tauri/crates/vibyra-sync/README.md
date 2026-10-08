# vibyra-sync

Mac core of cloud sync (contract: `docs/cloud-sync-contract.md`). Library `vibyra_sync` plus the
`vibyra-sync` CLI. No UI-toolkit dependencies. The HTTP client is **blocking** (`reqwest::blocking`):
call it from a worker thread or `tokio::task::spawn_blocking`, never directly on an async runtime thread.

## What it does

`sync_project` snapshots a project folder into a shadow bare repo that lives outside the project
(`<state dir>/cloud-sync/<projectKey>/shadow.git`), builds a `git bundle` (incremental when the cloud has
applied the previous one), seals it to the cloud computer's X25519 key (`VSYNC1`, see `crypto`), and uploads
it. `poll_down` downloads sealed bundles the cloud computer addressed to this Mac, opens them with this Mac's
key, fetches them into the shadow repo as `refs/vibyra/cloud`, and reports which files changed. Applying a
cloud change to the working tree is NOT done here: the app's existing three-way review (`cloud_merge`) does
it, reading base/theirs blobs through the readers below.

## Public API (all re-exported at the crate root)

```rust
// identity + wiring
let state_dir = vibyra_sync::default_state_dir();            // <config dir>/vibyra-desktop (honours VIBYRA_SYNC_STATE_DIR)
let keys  = DeviceKeys::load_or_create(&state_dir, &*default_backend(&state_dir))?; // device id uuid + X25519 pair
let client = Client::new(&base_url, &token)?;                // base_url rule = account_api::base_url (https or loopback http)
let engine = Engine::new(state_dir, client, keys);

engine.register_mac("Ellis's MacBook")?;                     // PUT /macs/{deviceId}
engine.account_state()?;                                     // GET /  -> AccountState {vm_key, macs, projects, used_bytes, limit_bytes}

// up
let project = ProjectRef { id: mac_project_id, name: "My App".into(), root: PathBuf::from("/path") };
let out = engine.sync_project(&project, &SyncOptions::default())?;   // -> SyncOutcome
//   Uploaded { seq, head, bytes, full, held_back, transcripts: Option<u64> } | Unchanged { held_back }
//   | Skipped { reason } ("too_large" | "no_files") | WaitingForCloud (vmKey not published yet)
// SyncOptions { include_env: false, include_transcripts: true, resync: false, max_file_bytes: 20 MiB,
//               max_project_bytes: 500 MiB, home: None }
engine.project_status(&project);                             // ProjectState (last uploaded seq/head/tree, held_back, last_error, diverged, ...)
engine.remove_project(&project)?;                            // DELETE /projects/{name} + forget local state

// down
let changes: Vec<CloudChange> = engine.poll_down(&mac_id)?;  // or poll_down_with(&mac_id, &DownOptions) -> DownReport
//   CloudChange { project_key, project, seq, head, base, files: Vec<FileChange{path, status: Added|Modified|Deleted, mode}> }
engine.pending_cloud_changes(&project);                      // Vec<CloudChange> fetched but not dismissed yet
engine.cloud_file(&project, Side::Theirs, "src/a.rs")?;      // Option<Vec<u8>>; Side::{Base, Theirs, Snapshot}
engine.cloud_tree(&project, Side::Theirs)?;                  // BTreeMap<path, TreeEntry{mode, sha}>
engine.dismiss_cloud_changes(&project, through_seq)?;        // after the review applied/declined them
engine.apply_cloud_if_clean(&project)?;                      // CLI helper (not for the app): ApplyOutcome::{NothingToApply, Applied, Conflicts}
```

`ours` in the three-way review is the working-tree file on disk; `Side::Snapshot` is the Mac's last uploaded
snapshot. `base` = merge-base of the cloud head and the last uploaded snapshot, else the last uploaded snapshot.

Opt-in Codex login carry-over: `engine.send_codex_login(&CodexSource::from_environment()?, force)` -> `LoginOutcome::{Sent, Unchanged, Throttled, NotSignedIn, WaitingForCloud}`, `engine.remove_codex_login()`, `engine.codex_login_status()`; CLI `send-login codex` / `remove-login codex`. It reads only `$CODEX_HOME/auth.json` and never logs or stores its contents (module `logins`).

Lower-level modules, each usable alone: `crypto` (`seal_stream`, `open_stream`, `seal_bytes`, `open_bytes`),
`secrets` (`secret_reason`, `secret_reason_with`), `scan` (`content_reason`), `snapshot` (`take_snapshot`,
`SnapshotOptions`, `SnapshotOutcome`), `bundle` (`create_bundle`, `verify_bundle`, `fetch_bundle`),
`transcripts` (`pack`, `unpack`, `rewrite_line`, `claude_dir_name`), `client`, `keys`, `state`, `vectors`.
A failed conversation upload does not fail `sync_project` (the code is already up); it is kept in `ProjectState.last_error`.
Discouraged to call `sync_project`/`poll_down` concurrently for one project from two processes (an in-process lock only).

## Behaviour worth knowing

- Snapshot = full tree: tracked + untracked, `.gitignore` honoured (also in folders that are not git repos),
  `.git`, symlinks, nested repos and files over 20 MiB excluded. Files that match the secrets denylist or whose
  content looks like a private key or token are **held back** (returned as `held_back`, never uploaded).
  `include_env: true` lets `.env`/`.envrc` files through; private keys and tokens (by name or content) are
  held back always, so an env file with a recognisable token is still held back.
- No repository-defined code runs: hooks off, fsmonitor off, no clean filters (`hash-object` is replaced by
  in-process loose-object writes of the bytes that were scanned), throwaway `GIT_INDEX_FILE`.
- The state dir holds the device secret key only as a 0600 file fallback; on macOS it prefers the Keychain.
- `vibyra-sync` CLI (staging tests, no app needed): `login --api URL --email E --password P`, `register-mac`,
  `status`, `once <dir> [--include-env] [--no-transcripts]`, `watch <dir>...`, `down`, `down-apply <dir>`.
  CLI state defaults to `<config dir>/vibyra-sync-cli` (override `VIBYRA_SYNC_STATE_DIR`); the CLI uses the
  absolute folder path as the project id.
- Tests: `cargo test -p vibyra-sync` (needs `git` on PATH; an in-process fake of the account API lives in `tests/common/fake`). Vectors: `docs/cloud-sync-vectors.json` (regenerate with `vibyra-sync gen-vectors`). Contract notes: end of `docs/cloud-sync-contract.md`.
