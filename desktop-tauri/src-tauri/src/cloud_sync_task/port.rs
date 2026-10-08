//! What the worker needs from the outside world, as traits, so the scheduling and
//! gating logic runs against fakes in tests and against the real engine and app
//! settings in the app (`real.rs`).

use vibyra_core::cloud_sync_settings::CloudSyncSettings;
use vibyra_sync::{
    AccountState, CloudChange, LoginOutcome, LoginStatus, ProjectRef, Result, SyncOptions,
    SyncOutcome,
};

/// What came of trying to write a cloud change into a project without asking.
#[derive(Debug, Clone, PartialEq)]
pub enum AutoApply {
    /// Every touched file was untouched on this Mac; the change was applied (with a backup).
    Applied(usize),
    /// Something the cloud touched also changed here; it waits for a review.
    NeedsReview,
}

pub trait Port: Send {
    fn account(&self) -> Result<AccountState>;
    fn register(&self, mac_name: &str) -> Result<()>;
    fn sync(&self, project: &ProjectRef, options: &SyncOptions) -> Result<SyncOutcome>;
    fn poll_down(&self) -> Result<Vec<CloudChange>>;
    fn remove(&self, project: &ProjectRef) -> Result<()>;
    /// Projects this Mac has synced before (id, name, root), whether or not they are still in settings.
    fn known(&self) -> Vec<ProjectRef>;
    fn remember(&self, project: &ProjectRef);
    fn forget(&self, project: &ProjectRef);
    fn auto_apply(&self, project: &ProjectRef) -> Result<AutoApply>;
    /// A token that changes when the account (or its session) does; `None` when signed out.
    fn session(&self) -> Option<String>;
    /// Sends the Codex login (`$CODEX_HOME/auth.json`) unless unchanged; `force` is an explicit request.
    /// Only ever called while the user's Codex switch is on.
    fn codex_login_send(&self, force: bool) -> Result<LoginOutcome>;
    /// `DELETE` the login this Mac sent.
    fn codex_login_remove(&self) -> Result<()>;
    /// What this Mac remembers of its last send (local, no request).
    fn codex_login_status(&self) -> LoginStatus;
}

/// A point-in-time copy of everything the worker reads from settings and the account.
#[derive(Debug, Clone)]
pub struct Config {
    pub signed_in: bool,
    pub sync: CloudSyncSettings,
    pub projects: Vec<ProjectRef>,
    pub mac_name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChangeNotice {
    pub project_id: String,
    pub project_name: String,
    pub project_key: String,
    pub seq: u64,
    pub files: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Something the status shows changed; the window may refresh.
    Status,
    /// The cloud changed files; each is announced once.
    Changes(Vec<ChangeNotice>),
}

pub trait Env: Send {
    fn config(&self) -> Config;
    fn emit(&self, event: Event);
}
