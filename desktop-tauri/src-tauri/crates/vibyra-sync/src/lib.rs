//! Mac core of cloud sync. See README.md and docs/cloud-sync-contract.md.
pub mod bundle;
pub mod client;
pub mod cloud;
pub mod crypto;
pub mod engine;
pub mod error;
pub mod fsutil;
pub mod git;
pub mod keys;
pub mod logins;
pub mod paths;
pub mod returned;
pub mod scan;
pub mod secrets;
pub mod snapshot;
pub mod state;
pub mod transcripts;
pub mod vectors;

pub use client::{
    AccountState, Client, CloudAccess, DownItem, MacRecord, Project, RemoteConsent, RetryPolicy,
};
pub use cloud::{ChangeStatus, CloudChange, FileChange, Side, TreeEntry};
pub use engine::{
    has_cloud_login, ApplyOutcome, DownOptions, DownReport, Engine, ProjectRef, SyncOptions,
    SyncOutcome,
};
pub use error::{Result, SyncError};
pub use keys::{default_backend, DeviceKeys, FileSecrets, SecretBackend};
pub use logins::{CodexSource, LoginOutcome, LoginStatus};
pub use paths::{default_state_dir, project_key, slug};
pub use snapshot::{HeldBack, Skipped, Snapshot, SnapshotOptions, SnapshotOutcome};
pub use state::ProjectState;
