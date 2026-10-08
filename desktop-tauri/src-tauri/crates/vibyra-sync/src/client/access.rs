//! What Vibyra Cloud may use (docs/cloud-access-contract.md): the allowed project keys in `GET /` and
//! `PUT /api/cloud-computer/access/projects`, the per-project tick. Nothing syncs until a project is ticked.
use super::{check, Client};
use crate::error::Result;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

/// `access` in `GET /`; absent from a server older than the access contract (then every project may sync).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloudAccess {
    /// `projectKey`s the person ticked for Vibyra Cloud.
    pub project_keys: Vec<String>,
    /// `allowed` or `blocked` (turned off from the iPhone).
    pub codex_carry_over: String,
}

impl CloudAccess {
    pub fn allows(&self, project_key: &str) -> bool {
        self.project_keys.iter().any(|k| k == project_key)
    }

    pub fn codex_blocked(&self) -> bool {
        self.codex_carry_over == "blocked"
    }
}

/// The API code for a project the person has not ticked (`POST /projects`, uploads).
pub const PROJECT_NOT_ALLOWED: &str = "project_not_allowed";
/// The API code for a Codex login upload the iPhone turned off.
pub const LOGIN_BLOCKED: &str = "login_blocked";

impl Client {
    /// `PUT /api/cloud-computer/access/projects` for one Mac project: `allowed: false` makes the server delete
    /// the cloud copy. The server derives the key from the Mac project id.
    pub fn put_project_access(&self, id: &str, name: &str, allowed: bool) -> Result<()> {
        let url = format!("{}/api/cloud-computer/access/projects", self.base);
        let body = json!({ "projects": [{ "id": id, "name": name, "allowed": allowed }] });
        let resp = self.send(|| {
            Ok(self
                .http
                .request(Method::PUT, &url)
                .timeout(Duration::from_secs(60))
                .json(&body))
        })?;
        check(resp).map(|_| ())
    }
}
