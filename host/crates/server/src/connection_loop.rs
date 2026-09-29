//! Authorized encrypted RPC and event loop after Noise confirmation.
use super::rpc::{dispatch, receive_request, send_frame, send_json, Request};
use super::{FrameReceiver, FrameSender, PreviewSession};
use crate::{remote_authorization::Access, remote_permissions, state::Shared};
use serde_json::{json, Value};
use std::{collections::VecDeque, sync::Arc, time::Duration};
use tokio::{sync::Notify, task::JoinHandle, time::MissedTickBehavior};
use vibyra_transport::Channel;

/// The request in the blocking pool, and the id its reply answers.
pub(super) type Running = Option<(String, JoinHandle<Result<Value, String>>)>;

/// The connection after its handshake, until the phone leaves, is displaced or
/// is revoked. Requests run one at a time in the order they arrived; while one
/// is in the blocking pool, and one can take many seconds, the tick keeps
/// draining terminal output and host events instead of letting them stall.
pub(super) async fn serve(
    shared: &Arc<Shared>,
    device_id: &str,
    connection: u64,
    takeover: &Arc<Notify>,
    input: &mut FrameReceiver,
    output: &FrameSender,
    channel: &mut Channel,
    running: &mut Running,
    first: Vec<u8>,
    access: Access,
    lan_policy: Option<(crate::lan_authorization::LanMode, u64)>,
) -> Result<(), String> {
    let events = shared.engine.subscribe();
    let mut preview = PreviewSession::new(shared, device_id, takeover, access.clone());
    let mut tick = tokio::time::interval(Duration::from_millis(20));
    // A tick missed while a send waited on a slow phone is dropped, not fired
    // in a burst once it catches up.
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut queue: VecDeque<Request> = VecDeque::new();
    let mut last_activity = tokio::time::Instant::now();
    receive_request(&first, &mut preview, &mut queue, &access)?;
    loop {
        if lan_policy.is_some_and(|(_, generation)| {
            shared
                .lan_generation
                .load(std::sync::atomic::Ordering::SeqCst)
                != generation
        }) {
            return Err("Local remote access policy changed; connect again".into());
        }
        if running.is_none() {
            if let Some(request) = queue.pop_front() {
                let id = request.id.clone();
                let state = shared.clone();
                let device = device_id.to_owned();
                let access = access.clone();
                *running = Some((
                    id,
                    tokio::task::spawn_blocking(move || {
                        dispatch(
                            &state,
                            &device,
                            connection,
                            request,
                            &access,
                            lan_policy.map(|(_, generation)| generation),
                        )
                    }),
                ));
            }
        }
        tokio::select! {
            // This same phone opened a newer connection; the workspace moves
            // there rather than the phone being told it is already connected.
            _ = takeover.notified() => return if shared.trusted(device_id) { Ok(()) } else { Err("Device revoked".into()) },
            result = async {
                match running.as_mut() {
                    Some((_, request)) => request.await,
                    None => std::future::pending().await,
                }
            } => {
                let id = running.take().map(|(id, _)| id).unwrap_or_default();
                let result = result.map_err(|_| "Host request failed")?;
                remote_permissions::valid(&access)?;
                let reply = match result {
                    Ok(result) => json!({"id":id,"ok":true,"result":result}),
                    Err(message) => json!({"id":id,"ok":false,"error":{"code":"REQUEST_REJECTED","message":message}}),
                };
                send_json(output, channel, reply, Some(&id)).await?;
            }
            _ = tick.tick() => {
                remote_permissions::valid(&access)?;
                if access.is_some() && last_activity.elapsed() >= Duration::from_secs(30 * 60) {
                    return Err("Remote session was idle too long; connect again".into());
                }
                if !shared.trusted(device_id) { return Err("Device revoked".into()); }
                for _ in 0..32 {
                    match events.try_recv() {
                        Ok(event) if unread(&event) || !remote_permissions::event(&access, &event) => {}
                        Ok(event) => send_json(output, channel, event, None).await?,
                        Err(std::sync::mpsc::TryRecvError::Empty) => break,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => return Err("Host events require resynchronization".into()),
                    }
                }
                // Preview goes after terminal replies and events have had their
                // turn, then fills the room they leave: two frames always, more
                // while a quarter of the outgoing channel is still free for
                // terminal traffic. Two a turn capped a site at 100 frames a
                // second, so a script's reply queued ~400 ms behind the rest of
                // the page. A paced Cloud relay fills the channel and so slows
                // Preview there, never the terminal.
                let reserve = output.max_capacity() / 4;
                for sent in 0..64 {
                    if sent >= 2 && output.capacity() <= reserve { break; }
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
                remote_permissions::valid(&access)?;
                let bytes = channel.decrypt(&frame)?;
                receive_request(&bytes, &mut preview, &mut queue, &access)?;
                last_activity = tokio::time::Instant::now();
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
