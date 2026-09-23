use crate::{
    auth,
    preview_connection::PreviewSession,
    state::{Origin, Shared},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::VecDeque, sync::Arc, time::Duration};
use tokio::{
    sync::{mpsc, Notify},
    task::JoinHandle,
    time::MissedTickBehavior,
};
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
        // Recording the visit syncs identity.json to disk, which is kept off
        // the few async workers every other phone's connection runs on.
        let (state, device) = (shared.clone(), device_id.clone());
        let _ = tokio::task::spawn_blocking(move || state.seen(&device, &origin)).await;
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
    let mut running = None;
    let result = serve(
        &shared,
        &device_id,
        &takeover,
        &mut input,
        &output,
        &mut channel,
        &mut running,
    )
    .await;
    // A request still in the blocking pool finishes before this device is
    // reported gone, as it did when requests were awaited in the loop, so
    // nothing it grants (a control lease) lands after that release.
    if let Some((_, request)) = running {
        let _ = request.await;
    }
    result
}

/// The request in the blocking pool, and the id its reply answers.
type Running = Option<(String, JoinHandle<Result<Value, String>>)>;

/// The connection after its handshake, until the phone leaves, is displaced or
/// is revoked. Requests run one at a time in the order they arrived; while one
/// is in the blocking pool, and one can take many seconds, the tick keeps
/// draining terminal output and host events instead of letting them stall.
async fn serve(
    shared: &Arc<Shared>,
    device_id: &str,
    takeover: &Arc<Notify>,
    input: &mut FrameReceiver,
    output: &FrameSender,
    channel: &mut Channel,
    running: &mut Running,
) -> Result<(), String> {
    let events = shared.engine.subscribe();
    let mut preview = PreviewSession::new(shared, device_id, takeover);
    let mut tick = tokio::time::interval(Duration::from_millis(20));
    // A tick missed while a send waited on a slow phone is dropped, not fired
    // in a burst once it catches up.
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut queue: VecDeque<Request> = VecDeque::new();
    loop {
        if running.is_none() {
            if let Some(request) = queue.pop_front() {
                let id = request.id.clone();
                let state = shared.clone();
                let device = device_id.to_owned();
                *running = Some((
                    id,
                    tokio::task::spawn_blocking(move || dispatch(&state, &device, request)),
                ));
            }
        }
        tokio::select! {
            // This same phone opened a newer connection; the workspace moves
            // there rather than the phone being told it is already connected.
            _ = takeover.notified() => return Ok(()),
            result = async {
                match running.as_mut() {
                    Some((_, request)) => request.await,
                    None => std::future::pending().await,
                }
            } => {
                let id = running.take().map(|(id, _)| id).unwrap_or_default();
                let result = result.map_err(|_| "Host request failed")?;
                let reply = match result {
                    Ok(result) => json!({"id":id,"ok":true,"result":result}),
                    Err(message) => json!({"id":id,"ok":false,"error":{"code":"REQUEST_REJECTED","message":message}}),
                };
                send_json(output, channel, reply, Some(&id)).await?;
            }
            _ = tick.tick() => {
                if !shared.trusted(device_id) { return Err("Device revoked".into()); }
                for _ in 0..32 {
                    match events.try_recv() {
                        Ok(event) if unread(&event) => {}
                        Ok(event) => send_json(output, channel, event, None).await?,
                        Err(std::sync::mpsc::TryRecvError::Empty) => break,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => return Err("Host events require resynchronization".into()),
                    }
                }
                // Preview gets at most two small frames per 20 ms turn and
                // only after terminal replies and events have had their turn.
                for _ in 0..2 {
                    let Some(frame) = preview.pop() else { break; };
                    let Ok(bytes) = frame.encode() else { preview.source_ended(); break; };
                    send_frame(output, channel.encrypt(&bytes)?).await?;
                }
            }
            // A full RPC queue stops reading, preserving terminal request
            // backpressure. Preview dispatch itself uses a separate worker.
            frame = input.recv(), if queue.len() < QUEUED => {
                let Some(frame) = frame else { return Ok(()) };
                if !shared.trusted(device_id) { return Err("Device revoked".into()); }
                let bytes = channel.decrypt(&frame)?;
                // JSON RPC cannot start with VP, so the discriminator is
                // collision-free and unknown Preview versions fail closed.
                if bytes.starts_with(b"VP") {
                    preview.receive(&bytes)?;
                    continue;
                }
                let request: Request = serde_json::from_slice(&bytes).map_err(|_| "Invalid request")?;
                if request.id.is_empty() || request.id.len() > 80 || request.method.len() > 80 {
                    return Err("Invalid request identifier or method".into());
                }
                queue.push_back(request);
            }
            frame = preview.next_outgoing(), if preview.collectable() => {
                if let Some(frame) = frame { preview.enqueue(frame); }
                else { preview.source_ended(); }
            }
        }
    }
}

/// Requests waiting behind the one in flight before input stops being read.
const QUEUED: usize = 32;

/// Events a backend sends only so its producing thread notices a receiver that
/// went away. No phone reads them, and forwarding each cost an encryption and
/// a network frame (through the relay, a base64 envelope counted against its
/// rate limit) five times a second for the life of the connection. Taking them
/// from the channel still gives the producer what it needs.
fn unread(event: &Value) -> bool {
    matches!(
        event["event"].as_str(),
        Some("desktop.heartbeat" | "shared.pulse")
    )
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
