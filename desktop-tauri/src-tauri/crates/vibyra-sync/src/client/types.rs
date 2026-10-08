use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub name: String,
    pub project_key: String,
    pub up_seq: u64,
    pub up_head: Option<String>,
    pub up_synced_at: Option<String>,
    pub up_applied_seq: u64,
    pub applied_at: Option<String>,
    /// `pending`, `synced`, `diverged`, `skipped` or `error`.
    pub state: String,
    pub reason: Option<String>,
    pub resync: bool,
    pub cloud_seq: u64,
    pub cloud_head: Option<String>,
    pub cloud_at: Option<String>,
    pub transcripts_seq: u64,
    pub transcripts_applied_seq: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MacRecord {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub last_seen_at: Option<String>,
}

/// `GET /api/cloud-computer/sync`
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AccountState {
    pub enabled: bool,
    /// The cloud computer's X25519 public key (64 hex), `None` until its first boot.
    pub vm_key: Option<String>,
    pub macs: Vec<MacRecord>,
    pub projects: Vec<Project>,
    pub used_bytes: u64,
    pub limit_bytes: u64,
    /// Carried logins (opt-in); absent from an older server.
    pub logins: super::CloudLogins,
    /// The phone's "Connect to cloud" agreement (newest, not revoked); `None` if never given or an older server.
    pub consent: Option<RemoteConsent>,
    /// The projects (and Codex carry-over) Vibyra Cloud may use; `None` from a server older than that contract.
    pub access: Option<super::CloudAccess>,
}

/// `consent` in `GET /`: the account agreed to the cloud on the phone, which also counts as this Mac's sync consent.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RemoteConsent {
    pub version: u32,
    pub accepted_at: Option<String>,
}

/// An un-acked blob the cloud computer addressed to this Mac.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DownItem {
    pub id: String,
    pub project: String,
    /// `code` or `transcripts`.
    pub kind: String,
    pub seq: u64,
    pub base_seq: u64,
    pub head: Option<String>,
    pub bytes: u64,
    pub sha256: String,
    pub created_at: Option<String>,
}

/// Parameters of one upload (`PUT /projects/{name}/up`).
#[derive(Debug, Clone)]
pub struct UploadParams<'a> {
    pub name: &'a str,
    /// `code` or `transcripts`.
    pub kind: &'a str,
    pub seq: u64,
    pub base_seq: u64,
    /// 40-hex commit for code, `None` sends `-`.
    pub head: Option<&'a str>,
    pub sha256: &'a str,
}
