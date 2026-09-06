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

pub async fn authenticate(shared: &Arc<Shared>, id: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 2048 {
        return Err("Authentication payload too large".into());
    }
    let hello: Hello =
        serde_json::from_slice(bytes).map_err(|_| "Invalid authentication payload")?;
    if hello.protocol != 1 {
        return Err("Unsupported protocol version".into());
    }
    if shared.trusted(id) {
        return Ok(());
    }
    if !shared.consume_invite(hello.invite.as_deref().unwrap_or("")) {
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
        "\nPair request from {}\nDevice key: {}\nType: approve {} (or deny {})",
        clean_name(&hello.device_name),
        id,
        id,
        id
    );
    let approved = tokio::time::timeout(Duration::from_secs(85), receive).await;
    if let Ok(mut pending) = shared.pending.lock() {
        pending.remove(id);
    }
    match approved {
        Ok(Ok(true)) => shared.trust(id, &hello.device_name),
        _ => Err("Pairing denied or expired".into()),
    }
}
