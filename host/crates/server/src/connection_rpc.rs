//! Bounded RPC admission, permission checks, and encrypted response encoding.
use super::{FrameSender, PreviewSession};
use crate::{remote_authorization::Access, remote_permissions, state::Shared};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::VecDeque, time::Duration};
use vibyra_transport::{Channel, MAX_PLAINTEXT};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Request {
    pub(super) id: String,
    pub(super) method: String,
    #[serde(default)]
    pub(super) params: Value,
}

pub(super) fn receive_request(
    bytes: &[u8],
    preview: &mut PreviewSession,
    queue: &mut VecDeque<Request>,
    access: &Access,
) -> Result<(), String> {
    // JSON RPC cannot start with VP; unknown Preview versions fail closed.
    if bytes.starts_with(b"VP") {
        remote_permissions::preview(access)?;
        return preview.receive(bytes);
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| "Invalid request")?;
    if request.id.is_empty() || request.id.len() > 80 || request.method.len() > 80 {
        return Err("Invalid request identifier or method".into());
    }
    queue.push_back(request);
    Ok(())
}

pub(super) fn dispatch(
    shared: &Shared,
    device: &str,
    connection: u64,
    request: Request,
    access: &Access,
    lan_generation: Option<u64>,
) -> Result<Value, String> {
    if lan_generation.is_some_and(|expected| {
        shared
            .lan_generation
            .load(std::sync::atomic::Ordering::SeqCst)
            != expected
    }) {
        return Err("Local approval expired; connect again".into());
    }
    if !shared.trusted(device) {
        return Err("Device revoked".into());
    }
    remote_permissions::request(access, &request.method, &request.params)?;
    if request.method == "device.revoke" {
        if request.params["deviceId"].as_str() != Some(device) {
            return Err("Other devices can only be revoked locally".into());
        }
        shared.revoke(device)?;
        return Ok(json!({"ok":true}));
    }
    let value =
        shared
            .engine
            .handle_on_connection(device, connection, &request.method, request.params)?;
    remote_permissions::response(
        access,
        &request.method,
        if request.method == "host.state" {
            shared.decorate_state(value)
        } else {
            value
        },
    )
}

pub(super) async fn send_json(
    sender: &FrameSender,
    channel: &mut Channel,
    value: Value,
    id: Option<&str>,
) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(&value).map_err(|_| "Invalid host response")?;
    if bytes.len() > MAX_PLAINTEXT {
        let Some(id) = id else {
            return Err("Event too large; resynchronization required".into());
        };
        bytes = json!({"id":id,"ok":false,"error":{"code":"PAYLOAD_TOO_LARGE","message":"Result exceeds remote frame limit"}}).to_string().into_bytes();
    }
    send_frame(sender, channel.encrypt(&bytes)?).await
}

pub(super) async fn send_frame(sender: &FrameSender, frame: Vec<u8>) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(10), sender.send(frame))
        .await
        .map_err(|_| "Connection too slow")?
        .map_err(|_| "Connection closed".into())
}
