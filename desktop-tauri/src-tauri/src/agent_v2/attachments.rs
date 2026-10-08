//! Attachments on a claimed run (`docs/agent-v2-api-contract.md` §6d). Each one
//! the claim names is downloaded with the lease generation, checked, and written
//! to the run's own `attachments/` folder under a generated name. Claude Code
//! has no file tools (`--tools ""`), so `blocks` later hands the content to it
//! inline, as untrusted data. The folder goes away with the rest of the run.

use super::api::RunnerApi;
use super::execute::Control;
use super::preflight::Refusal;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

#[path = "attachments_fetch.rs"]
mod fetch;
#[path = "attachments_inline.rs"]
mod inline;
#[path = "attachments_kind.rs"]
mod kind;
pub use inline::blocks;
pub use kind::{classify, file_name, label, Kind};

/// Contract §6d: uploads are at most 2 MB. Anything larger is not ours.
pub const MAX_BYTES: usize = 2 * 1024 * 1024;
/// Contract §7.
pub const MAX_COUNT: usize = 8;

#[derive(Debug, PartialEq)]
pub enum Saved {
    File {
        /// Display-only, sanitized; never used as a path.
        label: String,
        kind: Kind,
        path: PathBuf,
        bytes: usize,
    },
    /// An older client listed a name without an upload: nothing to fetch.
    Unread { label: String },
}

/// Why the run cannot start. `Stale`/`Cancelled` are fenced: post nothing.
#[derive(Debug, PartialEq)]
pub enum Stop {
    Fail(Refusal),
    Stale,
    Cancelled,
}

impl Stop {
    /// Contract `fail` code `runner_error`, with a reason the person can read.
    pub fn fail(reason: impl Into<String>) -> Self {
        Stop::Fail(Refusal {
            code: "runner_error",
            reason: reason.into(),
        })
    }
}

pub(super) fn check(control: &Control) -> Result<(), Stop> {
    if control.stale.load(Ordering::SeqCst) {
        return Err(Stop::Stale);
    }
    if control.cancel.load(Ordering::SeqCst) {
        return Err(Stop::Cancelled);
    }
    Ok(())
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(bytes)
}

/// Downloads and saves every attachment the claim names, in order.
pub async fn fetch_all(
    api: &RunnerApi,
    claimed: &Value,
    folder: &Path,
    control: &Control,
) -> Result<Vec<Saved>, Stop> {
    let items = claimed["attachments"].as_array().map_or(&[][..], |a| a);
    if items.is_empty() {
        return Ok(Vec::new());
    }
    if items.len() > MAX_COUNT {
        return Err(Stop::fail(format!(
            "A task can carry at most {MAX_COUNT} attachments."
        )));
    }
    let run = claimed["id"].as_str().unwrap_or_default();
    let generation = claimed["generation"].as_u64().unwrap_or(0);
    std::fs::create_dir_all(folder)
        .map_err(|_| Stop::fail("Could not prepare the attachments."))?;
    let mut saved = Vec::new();
    for (index, item) in items.iter().enumerate() {
        check(control)?;
        let n = index + 1;
        let label = label(item["name"].as_str().unwrap_or_default());
        let Some(id) = item["id"].as_str() else {
            saved.push(Saved::Unread { label });
            continue;
        };
        if !crate::agent_computer_access::looks_uuid(id) {
            return Err(Stop::fail(format!("Attachment {n} has an invalid id.")));
        }
        if item["size"]
            .as_u64()
            .is_some_and(|size| size > MAX_BYTES as u64)
        {
            return Err(fetch::too_large(n));
        }
        let body = fetch::get(api, run, generation, id, n, control).await?;
        let promised = item["sha256"].as_str().map(str::to_ascii_lowercase);
        let header = body.header_sha256.as_deref();
        if [promised.as_deref(), header]
            .into_iter()
            .flatten()
            .any(|expected| expected != body.sha256)
        {
            return Err(Stop::fail(format!("Attachment {n} arrived damaged.")));
        }
        let kind = classify(&body.content_type, &body.bytes)
            .map_err(|why| Stop::fail(format!("Attachment {n} {why}.")))?;
        let path = folder.join(file_name(index, &body.sha256, kind));
        write_private(&path, &body.bytes)
            .map_err(|_| Stop::fail(format!("Attachment {n} could not be saved on this Mac.")))?;
        saved.push(Saved::File {
            label,
            kind,
            path,
            bytes: body.bytes.len(),
        });
    }
    Ok(saved)
}

#[cfg(test)]
#[path = "attachments_tests.rs"]
mod tests;
