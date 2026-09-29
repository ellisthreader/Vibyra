//! Noise admission and Cloud authorization precede all content and presence.
use crate::{
    auth,
    lan_authorization::LanMode,
    preview_connection::PreviewSession,
    remote_authorization::{now, Access},
    state::{Origin, Shared},
};
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use vibyra_transport::{read_handshake, responder, write_handshake, Channel};

#[path = "connection_active.rs"]
mod active;
#[path = "connection_rpc.rs"]
mod rpc;
#[path = "connection_loop.rs"]
mod serving;
use active::ActiveDevice;
use rpc::send_frame;
use serving::serve;

pub type FrameSender = mpsc::Sender<Vec<u8>>;
pub type FrameReceiver = mpsc::Receiver<Vec<u8>>;

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
    input: FrameReceiver,
    output: FrameSender,
    origin: Origin,
) -> Result<(), String> {
    run_authorized(shared, input, output, origin, None).await
}

pub(crate) async fn run_authorized(
    shared: Arc<Shared>,
    mut input: FrameReceiver,
    output: FrameSender,
    origin: Origin,
    access: Access,
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
    let lan_policy = if matches!(origin, Origin::Nearby(_)) {
        Some((
            shared.lan_mode()?,
            shared
                .lan_generation
                .load(std::sync::atomic::Ordering::SeqCst),
        ))
    } else {
        None
    };
    let authenticated = match access
        .as_ref()
        .map_or(Ok(()), |grant| grant.bind(&device_id, &hello))
    {
        Ok(()) if lan_policy.is_some_and(|(mode, _)| mode == LanMode::Disabled) => {
            Err("Nearby remote access is disabled".into())
        }
        Ok(()) => {
            auth::authenticate_with_approval(
                &shared,
                &device_id,
                &hello,
                lan_policy.is_some_and(|(mode, _)| mode == LanMode::Ask),
                lan_policy.map(|(_, generation)| generation),
            )
            .await
        }
        Err(error) => Err(error),
    };
    let response = match &authenticated {
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
    authenticated?;
    let mut channel = Channel::from_handshake(handshake)?;
    // Noise IK's first handshake message can be replayed. Confirm the peer
    // knows this handshake's transport keys before displacing its old socket,
    // publishing presence or subscribing to sensitive output (Noise §7.7).
    let first = tokio::time::timeout(Duration::from_secs(10), input.recv())
        .await
        .map_err(|_| "Secure connection confirmation timed out")?
        .ok_or("Connection closed")?;
    let first = channel.decrypt(&first)?;
    if !shared.trusted(&device_id) {
        return Err("Device revoked".into());
    }
    if let Some(grant) = &access {
        grant.valid()?;
        let mut used = shared
            .used_remote_grants
            .lock()
            .map_err(|_| "Remote authorization unavailable")?;
        used.retain(|_, expires| *expires > now());
        if used.len() >= 4096 || used.contains_key(&grant.claims.jti) {
            return Err("Remote authorization was already used; connect again".into());
        }
        used.insert(grant.claims.jti.clone(), grant.claims.session_expires_at);
    }
    if lan_policy.is_some_and(|(_, generation)| {
        shared
            .lan_generation
            .load(std::sync::atomic::Ordering::SeqCst)
            != generation
    }) {
        return Err("Local approval expired; connect again".into());
    }
    let guard = ActiveDevice::claim(&shared, &device_id)?;
    if lan_policy.is_some_and(|(_, generation)| {
        shared
            .lan_generation
            .load(std::sync::atomic::Ordering::SeqCst)
            != generation
    }) {
        return Err("Local remote access policy changed; connect again".into());
    }
    // Recording the visit syncs identity.json off the async connection worker.
    let (state, device) = (shared.clone(), device_id.clone());
    let _ = tokio::task::spawn_blocking(move || state.seen(&device, &origin)).await;
    let takeover = guard.takeover.clone();
    let connection = guard.connection;
    let _guard = guard;
    let mut running = None;
    let result = serve(
        &shared,
        &device_id,
        connection,
        &takeover,
        &mut input,
        &output,
        &mut channel,
        &mut running,
        first,
        access,
        lan_policy,
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
