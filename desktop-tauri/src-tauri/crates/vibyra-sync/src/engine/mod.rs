//! The high-level API the desktop app (and the CLI) call. One `Engine` per signed-in account on this Mac.
mod access;
mod apply;
mod cloud_logins;
mod down;
mod logins;
pub use cloud_logins::has_cloud_login;
mod types;
mod up;
mod up_transcripts;
mod upload;
pub use types::*;

use crate::client::{AccountState, Client, MacRecord};
use crate::cloud::{self, Side, TreeEntry};
use crate::error::{Result, SyncError};
use crate::keys::DeviceKeys;
use crate::logins::LoginStore;
use crate::paths::{project_key, shadow_dir, tmp_dir};
use crate::snapshot::SNAP_REF;
use crate::state::{ProjectState, Store};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Engine {
    pub(crate) state_dir: PathBuf,
    pub(crate) client: Client,
    pub(crate) keys: DeviceKeys,
    pub(crate) store: Store,
    pub(crate) logins: LoginStore,
    /// Serialises work inside this process; two processes (app and CLI) on one project are not guarded.
    pub(crate) lock: Mutex<()>,
}

impl Engine {
    pub fn new(state_dir: impl Into<PathBuf>, client: Client, keys: DeviceKeys) -> Engine {
        let state_dir = state_dir.into();
        let store = Store::new(&state_dir);
        let logins = LoginStore::new(&state_dir);
        Engine {
            state_dir,
            client,
            keys,
            store,
            logins,
            lock: Mutex::new(()),
        }
    }

    pub fn device_id(&self) -> &str {
        &self.keys.device_id
    }

    pub fn state_dir(&self) -> &std::path::Path {
        &self.state_dir
    }

    /// `PUT /macs/{deviceId}`: publishes this Mac's public key so the cloud can seal changes back to it.
    pub fn register_mac(&self, name: &str) -> Result<MacRecord> {
        self.client
            .put_mac(&self.keys.device_id, &self.keys.public_hex(), name, true)
    }

    /// `GET /`: vmKey, Macs, every project's cloud state and the account's usage.
    pub fn account_state(&self) -> Result<AccountState> {
        self.client.account_state(&self.keys.device_id)
    }

    /// Saved local state of a project (last uploaded seq/head/tree, held-back files, last error, diverged flag).
    pub fn project_status(&self, project: &ProjectRef) -> ProjectState {
        self.store.load(&project_key(&project.id))
    }

    /// Every project that has local sync state.
    pub fn all_status(&self) -> Vec<ProjectState> {
        self.store.all()
    }

    /// `DELETE /projects/{name}` and forgets the local state and shadow repo ("Remove from the cloud").
    pub fn remove_project(&self, project: &ProjectRef) -> Result<()> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let key = project_key(&project.id);
        let st = self.store.load(&key);
        let name = if st.name.is_empty() {
            crate::paths::slug(&project.name)
        } else {
            st.name
        };
        match self.client.delete_project(&name) {
            Ok(()) => {}
            Err(SyncError::Api { status: 404, .. }) => {}
            Err(e) => return Err(e),
        }
        self.store.remove(&key);
        Ok(())
    }

    /// Cloud snapshots fetched into the shadow repo that nobody has dealt with yet.
    pub fn pending_cloud_changes(&self, project: &ProjectRef) -> Vec<cloud::CloudChange> {
        self.project_status(project).cloud
    }

    /// Forgets cloud changes up to `through_seq` once the review applied or declined them.
    pub fn dismiss_cloud_changes(&self, project: &ProjectRef, through_seq: u64) -> Result<()> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = self.store.load(&project_key(&project.id));
        st.cloud.retain(|c| c.seq > through_seq);
        self.store.save(&st)
    }

    fn side_rev(&self, project: &ProjectRef, side: Side) -> Result<Option<String>> {
        let key = project_key(&project.id);
        let st = self.store.load(&key);
        let shadow = shadow_dir(&self.state_dir, &key);
        let latest = st.cloud.last();
        Ok(match side {
            Side::Theirs => latest
                .map(|c| c.head.clone())
                .or_else(|| cloud::cloud_head(&shadow)),
            Side::Base => latest.and_then(|c| c.base.clone()),
            Side::Snapshot => st.up_head.or_else(|| cloud::rev(&shadow, SNAP_REF)),
        })
    }

    /// A file's bytes on one side of the review; `None` if that side does not have it.
    pub fn cloud_file(
        &self,
        project: &ProjectRef,
        side: Side,
        path: &str,
    ) -> Result<Option<Vec<u8>>> {
        let shadow = shadow_dir(&self.state_dir, &project_key(&project.id));
        match self.side_rev(project, side)? {
            Some(rev) => cloud::read_blob(&shadow, &rev, path),
            None => Ok(None),
        }
    }

    /// The whole tree of one side (`path -> mode, blob sha`); empty when that side does not exist.
    pub fn cloud_tree(
        &self,
        project: &ProjectRef,
        side: Side,
    ) -> Result<BTreeMap<String, TreeEntry>> {
        let shadow = shadow_dir(&self.state_dir, &project_key(&project.id));
        match self.side_rev(project, side)? {
            Some(rev) => cloud::read_tree(&shadow, &rev),
            None => Ok(BTreeMap::new()),
        }
    }

    pub(crate) fn tmp(&self, key: &str) -> Result<PathBuf> {
        let dir = tmp_dir(&self.state_dir, key);
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }
}

pub(crate) fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}
