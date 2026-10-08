//! Resumable uploads (`PUT /projects/{name}/up-part`): a big sealed file goes in pieces, so a weak connection (a Mac on a
//! phone hotspot) loses one piece on a drop, not the whole upload. The server answers 409 `offset_mismatch` with
//! `expected` when a piece is a repeat or a gap, and the upload carries on from there.
use super::{check, Client, Project, UploadParams};
use crate::error::{io_at, Result, SyncError};
use reqwest::{blocking::Body, Method};
use serde_json::Value;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::Duration;

/// Files at or above this size go in pieces; smaller ones in one request as before.
pub const PART_THRESHOLD: u64 = 16 * 1024 * 1024;
pub const PART_SIZE: u64 = 8 * 1024 * 1024;
/// Consecutive failed tries of one piece before giving up (each waits longer, up to a minute).
const PIECE_ATTEMPTS: u32 = 8;

impl Client {
    pub(crate) fn put_up_parts(&self, p: &UploadParams, file: &Path, len: u64) -> Result<Project> {
        let url = self.url(&format!("/projects/{}/up-part", p.name));
        let (mut offset, mut failures) = (0u64, 0u32);
        loop {
            let size = PART_SIZE.min(len - offset);
            let query = [
                ("kind", p.kind.to_string()),
                ("seq", p.seq.to_string()),
                ("baseSeq", p.base_seq.to_string()),
                ("head", p.head.unwrap_or("-").to_string()),
                ("sha256", p.sha256.to_string()),
                ("offset", offset.to_string()),
                ("total", len.to_string()),
            ];
            let mut f = std::fs::File::open(file).map_err(|e| io_at("open", file, e))?;
            f.seek(SeekFrom::Start(offset))
                .map_err(|e| io_at("seek", file, e))?;
            let req = self
                .http
                .request(Method::PUT, &url)
                .query(&query)
                .header("Content-Type", "application/octet-stream")
                .timeout(Duration::from_secs(10 * 60))
                .body(Body::sized(f.take(size), size));
            match self.prepare(req).send() {
                Ok(resp) if resp.status().as_u16() == 409 => {
                    let v: Value = resp.json().unwrap_or(Value::Null);
                    match (v["code"].as_str(), v["expected"].as_u64()) {
                        (Some("offset_mismatch"), Some(expected)) if expected <= len => {
                            offset = expected; // a piece that did arrive before the drop: carry on after it
                            failures = 0;
                            continue;
                        }
                        _ => {
                            return Err(SyncError::Api {
                                status: 409,
                                code: v["code"].as_str().unwrap_or("error").into(),
                                message: v["message"]
                                    .as_str()
                                    .unwrap_or("The upload was refused.")
                                    .into(),
                            })
                        }
                    }
                }
                Ok(resp) if resp.status().is_server_error() || resp.status().as_u16() == 429 => {
                    failures += 1
                }
                Ok(resp) => {
                    let v = check(resp)?;
                    if v["complete"].as_bool() == Some(true) {
                        return serde_json::from_value(
                            v.get("project").cloned().unwrap_or_default(),
                        )
                        .map_err(|_| {
                            SyncError::Invalid("The upload reply had no project.".into())
                        });
                    }
                    offset = v["received"]
                        .as_u64()
                        .filter(|n| *n > offset && *n <= len)
                        .ok_or_else(|| {
                            SyncError::Invalid(
                                "The upload reply did not say how much arrived.".into(),
                            )
                        })?;
                    failures = 0;
                    continue;
                }
                Err(e) => {
                    failures += 1;
                    if failures >= PIECE_ATTEMPTS {
                        return Err(SyncError::Network(super::network_detail(e)));
                    }
                }
            }
            if failures >= PIECE_ATTEMPTS {
                return Err(SyncError::Network(
                    "The account service kept refusing the upload.".into(),
                ));
            }
            std::thread::sleep(
                self.retry
                    .base_delay
                    .saturating_mul(1 << failures.min(6))
                    .min(Duration::from_secs(60)),
            );
        }
    }
}
