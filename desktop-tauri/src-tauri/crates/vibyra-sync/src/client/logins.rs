//! `PUT` / `DELETE /login/{provider}`: a sealed login blob (at most 256 KiB) goes up in memory, no temp file.
use super::{check, Client};
use crate::error::Result;
use reqwest::{blocking::Body, Method};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// What the cloud says about one carried login (`GET /` -> `logins.codex`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CloudLogin {
    pub seq: u64,
    pub applied_seq: u64,
    pub pending: bool,
    pub applied_at: Option<String>,
    /// `cloud`: a login made only for Vibyra Cloud (the person clicked Allow on this Mac); none: a copy.
    pub origin: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CloudLogins {
    pub codex: CloudLogin,
    pub claude: CloudLogin,
}

impl CloudLogins {
    pub fn get(&self, provider: &str) -> &CloudLogin {
        if provider == "claude" {
            &self.claude
        } else {
            &self.codex
        }
    }
}

impl Client {
    /// `PUT /login/{provider}?seq=&sha256=[&origin=cloud]`; `sealed` is the VSYNC1 stream and `sha256` its hash.
    pub fn put_login(
        &self,
        provider: &str,
        seq: u64,
        sha256: &str,
        sealed: &[u8],
        origin: Option<&str>,
    ) -> Result<()> {
        self.upload_login(provider, seq, sha256, sealed, origin, None)
    }

    /// Cloud-owned upload binds final server admission to the exact sealing key.
    pub fn put_cloud_login(
        &self,
        provider: &str,
        seq: u64,
        sha256: &str,
        sealed: &[u8],
        target_vm_key: &str,
    ) -> Result<()> {
        self.upload_login(
            provider,
            seq,
            sha256,
            sealed,
            Some("cloud"),
            Some(target_vm_key),
        )
    }

    fn upload_login(
        &self,
        provider: &str,
        seq: u64,
        sha256: &str,
        sealed: &[u8],
        origin: Option<&str>,
        target_vm_key: Option<&str>,
    ) -> Result<()> {
        let url = self.url(&format!("/login/{provider}"));
        let mut query = vec![("seq", seq.to_string()), ("sha256", sha256.to_string())];
        if let Some(origin) = origin {
            query.push(("origin", origin.to_string()));
        }
        if let Some(target) = target_vm_key {
            query.push(("targetVmKey", target.to_string()));
        }
        let resp = self.send(|| {
            Ok(self
                .http
                .request(Method::PUT, &url)
                .query(&query)
                .header("Content-Type", "application/octet-stream")
                .timeout(Duration::from_secs(60))
                .body(Body::from(sealed.to_vec())))
        })?;
        check(resp).map(|_| ())
    }

    /// Conditional legacy-copy removal. Cloud-owned replacements always survive.
    pub fn delete_login_copy(&self, provider: &str, expected_seq: u64) -> Result<()> {
        match self.json(
            Method::DELETE,
            &format!("/login/{provider}?expectedSeq={expected_seq}"),
            None,
        ) {
            Err(crate::error::SyncError::Api { status: 404, .. }) => Ok(()),
            other => other.map(|_| ()),
        }
    }

    /// `DELETE /login/{provider}`: removes any pending blob. An unknown login is not an error.
    pub fn delete_login(&self, provider: &str) -> Result<()> {
        match self.json(Method::DELETE, &format!("/login/{provider}"), None) {
            Err(crate::error::SyncError::Api { status: 404, .. }) => Ok(()),
            other => other.map(|_| ()),
        }
    }
}
