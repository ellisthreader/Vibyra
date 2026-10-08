use crate::{identity::clean_name, state::Shared};
use serde::Deserialize;
use std::{sync::Arc, time::Duration};
use tokio::sync::oneshot;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Hello {
    pub protocol: u32,
    pub device_name: String,
    pub invite: Option<String>,
    // Automatic recovery may reuse trust, but can never put a request on the computer.
    // Omitted by an explicit Connect tap to remain compatible with older Hosts.
    pub allow_approval: Option<bool>,
    // Bound to the server-signed Cloud authorization by connection admission.
    #[serde(default)]
    pub remote_session_id: Option<String>,
    #[serde(default)]
    pub remote_authorization_id: Option<String>,
}

struct Pending {
    shared: Arc<Shared>,
    id: String,
    request: Arc<()>,
}
impl Drop for Pending {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.shared.pending.lock() {
            if pending
                .get(&self.id)
                .is_some_and(|(_, _, owner)| Arc::ptr_eq(owner, &self.request))
            {
                pending.remove(&self.id);
            }
        }
    }
}

#[cfg(test)]
pub async fn authenticate(shared: &Arc<Shared>, id: &str, bytes: &[u8]) -> Result<(), String> {
    authenticate_with_approval(shared, id, bytes, false, None).await
}

#[cfg(test)]
pub async fn authenticate_with_approval(
    shared: &Arc<Shared>,
    id: &str,
    bytes: &[u8],
    every_time: bool,
    generation: Option<u64>,
) -> Result<(), String> {
    authenticate_with_notice(shared, id, bytes, every_time, generation, || {}).await
}

/// `authenticate_with_approval`, calling `on_pending` once this phone is
/// actually waiting in the local approval queue, so it can say so instead of
/// "Connecting…" while the computer shows the request.
pub async fn authenticate_with_notice(
    shared: &Arc<Shared>,
    id: &str,
    bytes: &[u8],
    every_time: bool,
    generation: Option<u64>,
    on_pending: impl FnOnce(),
) -> Result<(), String> {
    // Cloud may also await a local trust decision. Every pending approval is
    // invalidated by a concurrent revoke or account reset.
    let generation = Some(generation.unwrap_or_else(|| {
        shared
            .lan_generation
            .load(std::sync::atomic::Ordering::SeqCst)
    }));
    if bytes.len() > 2048 {
        return Err("Authentication payload too large".into());
    }
    let hello: Hello =
        serde_json::from_slice(bytes).map_err(|_| "Invalid authentication payload")?;
    if hello.protocol != 1 {
        return Err("Unsupported protocol version".into());
    }
    if hello
        .remote_session_id
        .as_ref()
        .is_some_and(|id| id.len() > 128)
        || hello
            .remote_authorization_id
            .as_ref()
            .is_some_and(|id| id.len() > 128)
    {
        return Err("Invalid remote authorization binding".into());
    }
    let trusted = shared.trusted(id);
    if trusted && !every_time {
        return Ok(());
    }
    if hello.allow_approval == Some(false) {
        return Err("Connect from your phone to request approval".into());
    }
    // A phone that found this Host over Bonjour has no code to present, so it
    // may reach the approval queue without an invitation. Trust still comes
    // only from the local Approve below; an invitation is required whenever
    // discovery is off, and any supplied invitation must still be valid.
    let nearby = shared.nearby && hello.invite.as_deref().unwrap_or("").is_empty();
    if !trusted && !nearby && !shared.consume_invite(hello.invite.as_deref().unwrap_or("")) {
        return Err("Pairing invitation invalid, used, or expired".into());
    }
    let (send, receive) = oneshot::channel();
    // A completed/cancelled older request must never erase a newer same-key request.
    let request = Arc::new(());
    {
        let mut pending = shared.pending.lock().map_err(|_| "Pairing unavailable")?;
        if pending.len() >= 8 || pending.contains_key(id) {
            return Err("Pairing busy; create a new invitation".into());
        }
        pending.insert(
            id.into(),
            (clean_name(&hello.device_name), send, request.clone()),
        );
    }
    let _pending = Pending {
        shared: shared.clone(),
        id: id.into(),
        request: request.clone(),
    };
    println!(
        "{} request from {}. {} Approve or deny device {} locally.",
        if trusted {
            "Nearby connection"
        } else if nearby {
            "Nearby pairing"
        } else {
            "Pair"
        },
        clean_name(&hello.device_name),
        shared.engine.pairing_notice(),
        id
    );
    on_pending();
    let approved = tokio::time::timeout(Duration::from_secs(85), receive).await;
    if let Ok(mut pending) = shared.pending.lock() {
        if pending
            .get(id)
            .is_some_and(|(_, _, owner)| Arc::ptr_eq(owner, &request))
        {
            pending.remove(id);
        }
    }
    match approved {
        Ok(Ok(true)) => shared.trust_with_generation(id, &hello.device_name, generation),
        _ => Err("Pairing denied or expired".into()),
    }
}
