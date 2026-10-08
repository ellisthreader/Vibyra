//! Mac to cloud: snapshot, skip if unchanged, bundle, seal, upload, transcripts.
use super::upload::Prepared;
use super::{now, Engine, ProjectRef, SyncOptions, SyncOutcome};
use crate::bundle::{create_bundle, verify_bundle};
use crate::client::Project;
use crate::crypto::unhex;
use crate::error::Result;
use crate::git::Git;
use crate::paths::{project_key, shadow_dir, slug};
use crate::snapshot::{take_snapshot, SnapshotOptions, SnapshotOutcome, SNAP_REF};
use crate::state::ProjectState;
use std::path::Path;

impl Engine {
    /// Snapshot `project`, and when its tree changed upload it; then upload new conversations. Safe to call as
    /// often as you like (debounced file changes, a sweep, focus loss, system sleep): an unchanged project
    /// costs one snapshot and two small requests.
    pub fn sync_project(&self, project: &ProjectRef, opts: &SyncOptions) -> Result<SyncOutcome> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let key = project_key(&project.id);
        let mut st = self.store.load(&key);
        st.root = project.root.to_string_lossy().into_owned();
        st.last_error = None;
        let result = self.sync_inner(project, opts, &key, &mut st);
        if let Err(e) = &result {
            st.last_error = Some(e.to_string());
        }
        self.store.save(&st)?;
        result
    }

    fn sync_inner(
        &self,
        project: &ProjectRef,
        opts: &SyncOptions,
        key: &str,
        st: &mut ProjectState,
    ) -> Result<SyncOutcome> {
        let account = self.client.account_state(&self.keys.device_id)?;
        let Some(vm_key) = account.vm_key.as_deref().and_then(unhex::<32>) else {
            return Ok(SyncOutcome::WaitingForCloud);
        };
        let shadow = shadow_dir(&self.state_dir, key);
        let proposed = if st.name.is_empty() {
            slug(&project.name)
        } else {
            st.name.clone()
        };
        let snap_opts = SnapshotOptions {
            include_env: opts.include_env,
            max_file_bytes: opts.max_file_bytes,
            max_project_bytes: opts.max_project_bytes,
        };
        let snap = match take_snapshot(&project.root, &shadow, &snap_opts)? {
            SnapshotOutcome::Taken(s) => s,
            SnapshotOutcome::NoFiles { held_back } => {
                st.held_back = held_back;
                return self.skipped(key, &proposed, "no_files", st);
            }
            SnapshotOutcome::TooLarge { .. } => {
                return self.skipped(key, &proposed, "too_large", st)
            }
        };
        st.held_back = snap.held_back.clone();
        st.skipped = snap.skipped.clone();
        st.skipped_reason = None;
        let mut cloud = self.client.post_project(key, &proposed, None)?;
        st.name = cloud.name.clone();

        let same = st.up_tree.as_deref() == Some(snap.tree.as_str())
            && st.up_head.is_some()
            && cloud.up_head == st.up_head
            && !cloud.resync
            && !opts.resync;
        let mut code = None;
        if !same {
            let up = self.upload(
                key,
                &st.name.clone(),
                "code",
                cloud.clone(),
                &vm_key,
                &|p, full| self.prepare_code(key, &shadow, p, full || opts.resync, &snap.commit),
            )?;
            cloud = up.project.clone();
            st.up_seq = up.seq;
            st.up_head = Some(snap.commit.clone());
            st.up_tree = Some(snap.tree.clone());
            st.up_at = Some(now());
            st.diverged = cloud.state == "diverged";
            code = Some((up.seq, up.bytes, up.base_seq == 0));
        }
        let transcripts_seq = if opts.include_transcripts {
            self.upload_transcripts(key, project, opts, st, cloud, &vm_key)?
        } else {
            None
        };
        Ok(match code {
            Some((seq, bytes, full)) => SyncOutcome::Uploaded {
                seq,
                head: snap.commit,
                bytes,
                full,
                held_back: snap.held_back,
                transcripts_seq,
            },
            None => SyncOutcome::Unchanged {
                held_back: snap.held_back,
                transcripts_seq,
            },
        })
    }

    fn skipped(
        &self,
        key: &str,
        name: &str,
        reason: &str,
        st: &mut ProjectState,
    ) -> Result<SyncOutcome> {
        let granted = self.client.post_project(key, name, Some(reason))?;
        st.name = granted.name;
        st.skipped_reason = Some(reason.into());
        Ok(SyncOutcome::Skipped {
            reason: reason.into(),
        })
    }

    /// Writes the bundle for the attempt: incremental against the last uploaded head. That head need not be applied yet: the
    /// server keeps every un-applied bundle and the cloud computer applies them in seq order, so edits made while it sleeps
    /// cost only their own size (they were a whole-project upload each). A missing prerequisite on the cloud reports
    /// `needFull`, which sets `resync` and the next upload is full again.
    fn prepare_code(
        &self,
        key: &str,
        shadow: &Path,
        p: &Project,
        force_full: bool,
        commit: &str,
    ) -> Result<Prepared> {
        let git = Git::shadow(shadow);
        let base = p.up_head.as_deref().filter(|h| {
            !force_full
                && !p.resync
                && p.up_seq > 0
                && git
                    .out(&["cat-file", "-e", &format!("{h}^{{commit}}")])
                    .is_ok()
        });
        let out = self.tmp(key)?.join("code.bundle");
        create_bundle(shadow, SNAP_REF, base, &out)?;
        verify_bundle(shadow, &out)?;
        Ok(Prepared {
            plain: out,
            base_seq: if base.is_some() { p.up_seq } else { 0 },
            head: Some(commit.to_string()),
        })
    }
}
