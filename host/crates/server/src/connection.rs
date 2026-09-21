use crate::{
    auth,
    state::{Origin, Shared},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::sync::{mpsc, Notify};
use vibyra_transport::{read_handshake, responder, write_handshake, Channel, MAX_PLAINTEXT};

pub type FrameSender = mpsc::Sender<Vec<u8>>;
pub type FrameReceiver = mpsc::Receiver<Vec<u8>>;

struct ActiveDevice {
    shared: Arc<Shared>,
    id: String,
    takeover: Arc<Notify>,
}
impl ActiveDevice {
    /// Takes this device's single connection slot, asking whatever held it to
    /// stand down. A phone reconnecting after its Wi-Fi went is the ordinary
    /// case: the socket it left can look alive here long after the phone knows
    /// it is gone, and refusing the new one leaves nothing able to reach it.
    fn claim(shared: &Arc<Shared>, id: &str) -> Result<Self, String> {
        let takeover = Arc::new(Notify::new());
        let mut active = shared
            .active
            .lock()
            .map_err(|_| "Connections unavailable")?;
        if let Some(previous) = active.insert(id.to_owned(), takeover.clone()) {
            previous.notify_one();
        }
        Ok(Self {
            shared: shared.clone(),
            id: id.to_owned(),
            takeover,
        })
    }
}
impl Drop for ActiveDevice {
    fn drop(&mut self) {
        // A newer connection from this same phone may already hold the slot.
        // Only the one that still owns it reports the device as gone, so a
        // reconnect does not release the terminal control it has just taken on.
        let owned = self
            .shared
            .active
            .lock()
            .map(|mut active| {
                let owned = active
                    .get(&self.id)
                    .is_some_and(|slot| Arc::ptr_eq(slot, &self.takeover));
                if owned {
                    active.remove(&self.id);
                }
                owned
            })
            .unwrap_or(false);
        if owned {
            self.shared.engine.disconnected(&self.id);
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    id: String,
    method: String,
    #[serde(default)]
    params: Value,
}

/// Test harnesses connect in-process, with nowhere to have come from.
#[cfg(test)]
pub async fn run(
    shared: Arc<Shared>,
    input: FrameReceiver,
    output: FrameSender,
) -> Result<(), String> {
    run_from(shared, input, output, Origin::Unknown).await
}

/// `run`, told where the connection came from so the phone's record in
/// Settings can say when and from where it last connected.
pub async fn run_from(
    shared: Arc<Shared>,
    mut input: FrameReceiver,
    output: FrameSender,
    origin: Origin,
) -> Result<(), String> {
    let first = tokio::time::timeout(Duration::from_secs(10), input.recv())
        .await
        .map_err(|_| "Handshake timed out")?
        .ok_or("Connection closed")?;
    let private = {
        let identity = shared.identity.lock().map_err(|_| "Identity unavailable")?;
        hex::decode(&identity.private_key).map_err(|_| "Host identity invalid")?
    };
    let mut handshake = responder(&private)?;
    let hello = read_handshake(&mut handshake, &first)?;
    let device_id = hex::encode(
        handshake
            .get_remote_static()
            .ok_or("Device identity missing")?,
    );
    let authenticated = auth::authenticate(&shared, &device_id, &hello).await;
    let claimed = authenticated.and_then(|()| ActiveDevice::claim(&shared, &device_id));
    if claimed.is_ok() {
        shared.seen(&device_id, &origin);
    }
    let response = match &claimed {
        Ok(_) => json!({"ok":true,"protocol":1,"deviceId":device_id}),
        Err(message) => {
            json!({"ok":false,"error":{"code":"AUTHENTICATION_FAILED","message":message}})
        }
    };
    send_frame(
        &output,
        write_handshake(&mut handshake, response.to_string().as_bytes())?,
    )
    .await?;
    let guard = claimed?;
    let takeover = guard.takeover.clone();
    let _guard = guard;
    let mut channel = Channel::from_handshake(handshake)?;
    let events = shared.engine.subscribe();
    let mut tick = tokio::time::interval(Duration::from_millis(20));
    loop {
        tokio::select! {
            // This same phone opened a newer connection; the workspace moves
            // there rather than the phone being told it is already connected.
            _ = takeover.notified() => return Ok(()),
            frame = input.recv() => {
                let Some(frame) = frame else { return Ok(()) };
                if !shared.trusted(&device_id) { return Err("Device revoked".into()); }
                let bytes = channel.decrypt(&frame)?;
                let request: Request = serde_json::from_slice(&bytes).map_err(|_| "Invalid request")?;
                if request.id.is_empty() || request.id.len() > 80 || request.method.len() > 80 {
                    return Err("Invalid request identifier or method".into());
                }
                let id = request.id.clone();
                let state = shared.clone();
                let device = device_id.clone();
                let result = tokio::task::spawn_blocking(move || dispatch(&state, &device, request)).await
                    .map_err(|_| "Host request failed")?;
                let reply = match result {
                    Ok(result) => json!({"id":id,"ok":true,"result":result}),
                    Err(message) => json!({"id":id,"ok":false,"error":{"code":"REQUEST_REJECTED","message":message}}),
                };
                send_json(&output, &mut channel, reply, Some(&id)).await?;
            }
            _ = tick.tick() => {
                if !shared.trusted(&device_id) { return Err("Device revoked".into()); }
                for _ in 0..32 {
                    match events.try_recv() {
                        Ok(event) => send_json(&output, &mut channel, event, None).await?,
                        Err(std::sync::mpsc::TryRecvError::Empty) => break,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => return Err("Host events require resynchronization".into()),
                    }
                }
            }
        }
    }
}

fn dispatch(shared: &Shared, device: &str, request: Request) -> Result<Value, String> {
    if !shared.trusted(device) {
        return Err("Device revoked".into());
    }
    if request.method == "device.revoke" {
        if request.params["deviceId"].as_str() != Some(device) {
            return Err("Other devices can only be revoked locally".into());
        }
        shared.revoke(device)?;
        return Ok(json!({"ok":true}));
    }
    let value = shared
        .engine
        .handle(device, &request.method, request.params)?;
    Ok(if request.method == "host.state" {
        shared.decorate_state(value)
    } else {
        value
    })
}

async fn send_json(
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

async fn send_frame(sender: &FrameSender, frame: Vec<u8>) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(10), sender.send(frame))
        .await
        .map_err(|_| "Connection too slow")?
        .map_err(|_| "Connection closed".into())
}
