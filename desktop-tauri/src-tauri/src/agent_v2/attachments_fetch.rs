//! One attachment download: `GET /runner/{runtime}/runs/{run}/attachments/{id}
//! ?generation=N` (contract §6d). The client never follows a redirect (the
//! runner key must not leave the backend host), reads at most `MAX_BYTES`, and
//! maps the lease fences to `Stop` so a stale run is abandoned, not failed.

use super::{check, Stop, MAX_BYTES};
use crate::agent_v2::api::RunnerApi;
use crate::agent_v2::execute::Control;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;
use std::time::Duration;

pub struct Body {
    pub bytes: Vec<u8>,
    /// The `Content-Type` header as sent.
    pub content_type: String,
    /// Lowercase hex of what arrived.
    pub sha256: String,
    /// `X-Attachment-Sha256`, when the backend sent one.
    pub header_sha256: Option<String>,
}

static CLIENT: LazyLock<Option<reqwest::Client>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .build()
        .ok()
});

pub fn too_large(n: usize) -> Stop {
    Stop::fail(format!(
        "Attachment {n} is larger than 2 MB, so Vibyra did not send it to Claude."
    ))
}

fn unreachable(n: usize) -> Stop {
    Stop::fail(format!(
        "Vibyra Cloud could not be reached to fetch attachment {n}."
    ))
}

pub async fn get(
    api: &RunnerApi,
    run: &str,
    generation: u64,
    id: &str,
    n: usize,
    control: &Control,
) -> Result<Body, Stop> {
    let client = CLIENT
        .as_ref()
        .ok_or_else(|| Stop::fail("Vibyra could not prepare a safe download."))?;
    let url = format!(
        "{}/api/agents/v2/runner/{}/runs/{run}/attachments/{id}?generation={generation}",
        api.base, api.runtime_id
    );
    let mut attempt = 0;
    let mut response = loop {
        check(control)?;
        let sent = client
            .get(&url)
            .header("X-Vibyra-Runner-Key", &api.key)
            .header("Accept", "*/*")
            .timeout(Duration::from_secs(60))
            .send()
            .await;
        match sent {
            Ok(response) => break response,
            Err(_) if attempt < 2 => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Err(_) => return Err(unreachable(n)),
        }
    };
    let status = response.status();
    if status.is_redirection() {
        return Err(Stop::fail(format!(
            "Vibyra Cloud tried to send attachment {n} somewhere else, so Vibyra did not fetch it."
        )));
    }
    if !status.is_success() {
        return Err(refusal(response, n).await);
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err(too_large(n));
    }
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let content_type = header("content-type").unwrap_or_default();
    let header_sha256 = header("x-attachment-sha256").map(|sha| sha.to_ascii_lowercase());
    let (mut bytes, mut hasher) = (Vec::new(), Sha256::new());
    while let Some(chunk) = response.chunk().await.map_err(|_| unreachable(n))? {
        check(control)?;
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(too_large(n));
        }
        hasher.update(&chunk);
        bytes.extend_from_slice(&chunk);
    }
    Ok(Body {
        bytes,
        content_type,
        sha256: format!("{:x}", hasher.finalize()),
        header_sha256,
    })
}

/// A refusal is `{ok:false, code, error}`: branch on `code`, never on text.
async fn refusal(mut response: reqwest::Response, n: usize) -> Stop {
    let status = response.status().as_u16();
    let mut raw = Vec::new();
    while raw.len() < 16_384 {
        match response.chunk().await {
            Ok(Some(chunk)) => raw.extend_from_slice(&chunk),
            _ => break,
        }
    }
    let body: serde_json::Value = serde_json::from_slice(&raw).unwrap_or_default();
    match body["code"].as_str() {
        Some("stale_lease") => Stop::Stale,
        Some("run_cancelled" | "run_finished") => Stop::Cancelled,
        Some("attachment_not_found") => Stop::fail(format!(
            "Attachment {n} is no longer available. Attach it again and send the task again."
        )),
        _ => Stop::fail(format!("Vibyra Cloud refused attachment {n} ({status}).")),
    }
}
