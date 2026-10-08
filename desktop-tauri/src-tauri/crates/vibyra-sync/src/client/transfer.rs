//! Large sealed files: uploads stream from disk, downloads stream to disk; neither is held in memory.
use super::{check, Client, Project, UploadParams};
use crate::error::{io_at, Result, SyncError};
use reqwest::{blocking::Body, Method};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

impl Client {
    /// `PUT /projects/{name}/up`. `file` is the sealed stream whose SHA-256 is `p.sha256`.
    pub fn put_up(&self, p: &UploadParams, file: &Path) -> Result<Project> {
        let len = std::fs::metadata(file)
            .map_err(|e| io_at("stat", file, e))?
            .len();
        // A big file goes in resumable pieces, so a dropped connection costs one piece, not the whole upload.
        if len >= super::parts::PART_THRESHOLD {
            return self.put_up_parts(p, file, len);
        }
        let url = self.url(&format!("/projects/{}/up", p.name));
        let query = [
            ("kind", p.kind.to_string()),
            ("seq", p.seq.to_string()),
            ("baseSeq", p.base_seq.to_string()),
            ("head", p.head.unwrap_or("-").to_string()),
            ("sha256", p.sha256.to_string()),
        ];
        let resp = self.send(|| {
            // Reopened per try: a retry restarts the stream from byte 0.
            let f = std::fs::File::open(file).map_err(|e| io_at("open", file, e))?;
            Ok(self
                .http
                .request(Method::PUT, &url)
                .query(&query)
                .header("Content-Type", "application/octet-stream")
                .timeout(Duration::from_secs(60 * 30))
                .body(Body::sized(f, len)))
        })?;
        let v = check(resp)?;
        serde_json::from_value(v.get("project").cloned().unwrap_or_default())
            .map_err(|_| SyncError::Invalid("The upload reply had no project.".into()))
    }

    /// `GET /down/{id}` streamed to `dest`; verifies the ciphertext SHA-256 against `expect_sha256`.
    /// A failed or mismatching download is retried like any request, then reported.
    pub fn download_down(&self, id: &str, dest: &Path, expect_sha256: &str) -> Result<u64> {
        let url = self.url(&format!("/down/{id}"));
        let mut delay = self.retry.base_delay;
        let mut last = SyncError::Network("The download failed.".into());
        for attempt in 0..self.retry.attempts.max(1) {
            if attempt > 0 {
                std::thread::sleep(delay);
                delay *= 2;
            }
            let resp = self.send(|| {
                Ok(self
                    .http
                    .get(&url)
                    .header("Accept", "application/octet-stream")
                    .timeout(Duration::from_secs(60 * 30)))
            })?;
            if !resp.status().is_success() {
                check(resp)?;
                return Err(SyncError::Invalid("unexpected download reply".into()));
            }
            match save_hashed(resp, dest) {
                Ok((n, sha)) if expect_sha256.is_empty() || sha == expect_sha256 => return Ok(n),
                Ok(_) => last = SyncError::Crypto("download checksum mismatch"),
                Err(e) => last = e,
            }
        }
        let _ = std::fs::remove_file(dest);
        Err(last)
    }
}

fn save_hashed(mut src: impl Read, dest: &Path) -> Result<(u64, String)> {
    let mut f = std::fs::File::create(dest).map_err(|e| io_at("create", dest, e))?;
    let (mut hasher, mut total, mut buf) = (Sha256::new(), 0u64, vec![0u8; 64 * 1024]);
    loop {
        let n = src
            .read(&mut buf)
            .map_err(|e| SyncError::Network(format!("download interrupted: {e}")))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        f.write_all(&buf[..n])?;
        total += n as u64;
    }
    f.sync_all()?;
    Ok((total, crate::crypto::hex(&hasher.finalize())))
}
