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
    // Bound to the server-signed Cloud authorization by connection admission.
    #[serde(default)]
    pub remote_session_id: Option<String>,
    #[serde(default)]
    pub remote_authorization_id: Option<String>,
}

struct Pending {
    shared: Arc<Shared>,
    id: String,
}
impl Drop for Pending {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.shared.pending.lock() {
            pending.remove(&self.id);
        }
    }
}

#[cfg(test)]
#[allow(dead_code)] // Used by the standalone binary's pairing tests.
pub async fn authenticate(shared: &Arc<Shared>, id: &str, bytes: &[u8]) -> Result<(), String> {
    authenticate_with_approval(shared, id, bytes, false, None).await
}

pub async fn authenticate_with_approval(
    shared: &Arc<Shared>,
    id: &str,
    bytes: &[u8],
    every_time: bool,
    generation: Option<u64>,
) -> Result<(), String> {
    // Cloud may also await a local trust decision. Every pending approval is
    // invalidated by a concurrent revoke or account reset.
    let generation = generation.unwrap_or_else(|| {
        shared
            .lan_generation
            .load(std::sync::atomic::Ordering::SeqCst)
    });
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
    // "Ask every time" asks once per visit: a phone back from a lock resumes.
    if trusted && (!every_time || shared.resume_lan_visit(id)) {
        return Ok(());
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
    {
        let mut pending = shared.pending.lock().map_err(|_| "Pairing unavailable")?;
        if pending.len() >= 8 || pending.contains_key(id) {
            return Err("Pairing busy; create a new invitation".into());
        }
        pending.insert(id.into(), (clean_name(&hello.device_name), send));
    }
    let _pending = Pending {
        shared: shared.clone(),
        id: id.into(),
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
    let approved = tokio::time::timeout(Duration::from_secs(85), receive).await;
    if let Ok(mut pending) = shared.pending.lock() {
        pending.remove(id);
    }
    match approved {
        Ok(Ok(true)) => {
            shared.trust_with_generation(id, &hello.device_name, Some(generation))?;
            if every_time {
                shared.begin_lan_visit(id, generation);
            }
            Ok(())
        }
        _ => Err("Pairing denied or expired".into()),
    }
}
