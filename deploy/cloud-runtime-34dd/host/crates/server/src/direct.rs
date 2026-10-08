use crate::{
    connection, peer_policy, presence,
    state::{Origin, Shared},
};
use futures_util::{SinkExt, StreamExt};
use std::{sync::Arc, time::Duration};
use tokio::{
    net::TcpListener,
    sync::{mpsc, Semaphore},
};
use tokio_tungstenite::{
    accept_hdr_async_with_config,
    tungstenite::{
        handshake::server::{Request, Response},
        protocol::WebSocketConfig,
        Message,
    },
};

/// Whether an accept failure is about one incoming socket (or a momentary
/// lack of descriptors) rather than the listener itself. Returning on these
/// left the computer unreachable nearby until Vibyra was restarted.
fn transient(error: &std::io::Error) -> bool {
    use std::io::ErrorKind::*;
    matches!(
        error.kind(),
        ConnectionAborted | ConnectionReset | Interrupted | WouldBlock | TimedOut
    ) || matches!(error.raw_os_error(), Some(23 | 24 | 53 | 54 | 55))
}

#[cfg(feature = "standalone")]
pub async fn serve(listener: TcpListener, shared: Arc<Shared>) -> Result<(), String> {
    serve_with_policy(listener, shared, true).await
}

pub async fn serve_with_policy(
    listener: TcpListener,
    shared: Arc<Shared>,
    lan_only: bool,
) -> Result<(), String> {
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    if lan_only && !peer_policy::allowed(address, address) {
        return Err("Nearby listening requires a specific loopback or LAN address".into());
    }
    let permits = Arc::new(Semaphore::new(32));
    loop {
        let (mut stream, peer) = match listener.accept().await {
            Ok(accepted) => accepted,
            Err(error) if transient(&error) => {
                eprintln!("Nearby accept failed, continuing: {error}");
                tokio::time::sleep(Duration::from_millis(100)).await;
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };
        if lan_only && !peer_policy::allowed(address, peer) {
            continue;
        }
        let Ok(permit) = permits.clone().try_acquire_owned() else {
            continue;
        };
        let shared = shared.clone();
        tokio::spawn(async move {
            let _permit = permit;
            // A client that cannot browse Bonjour asks this address for the
            // same presence instead. Peeked, so the WebSocket path is untouched.
            if presence::intercept(&mut stream, &shared).await {
                return;
            }
            let config = WebSocketConfig::default()
                .max_message_size(Some(vibyra_transport::MAX_FRAME))
                .max_frame_size(Some(vibyra_transport::MAX_FRAME));
            // A phone that reads the approval notice says so in its URL; older
            // Hosts ignore the query, so the phone can always send it.
            let mut approval_notice = false;
            let capture = |request: &Request, response: Response| {
                approval_notice = request
                    .uri()
                    .query()
                    .is_some_and(|query| query.split('&').any(|pair| pair == "caps=approval"));
                Ok(response)
            };
            let accepted = tokio::time::timeout(
                Duration::from_secs(5),
                accept_hdr_async_with_config(stream, capture, Some(config)),
            )
            .await;
            let Ok(Ok(socket)) = accepted else { return };
            let (input_send, input_receive) = mpsc::channel(32);
            let (output_send, mut output_receive) = mpsc::channel(32);
            let task = tokio::spawn(connection::run_nearby(
                shared,
                input_receive,
                output_send,
                Origin::Nearby(peer.ip().to_string()),
                approval_notice,
            ));
            // A large Preview response can keep the WebSocket sink waiting for
            // room. Read credits from the phone independently while it waits;
            // otherwise the sender cannot make progress until that wait ends.
            let (mut sink, mut source) = socket.split();
            let (pong_send, mut pong_receive) = mpsc::channel::<Message>(4);
            let mut writer = tokio::spawn(async move {
                let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
                loop {
                    let message = tokio::select! {
                        frame = output_receive.recv() => match frame {
                            Some(frame) => Message::Binary(frame.into()),
                            None => break,
                        },
                        pong = pong_receive.recv() => match pong {
                            Some(pong) => pong,
                            None => break,
                        },
                        _ = heartbeat.tick() => Message::Ping(Vec::new().into()),
                    };
                    if !matches!(
                        tokio::time::timeout(Duration::from_secs(10), sink.send(message)).await,
                        Ok(Ok(()))
                    ) {
                        break;
                    }
                }
            });
            let mut idle_check = tokio::time::interval(Duration::from_secs(20));
            let mut last_seen = tokio::time::Instant::now();
            let mut task = task;
            // Once the connection itself ends, its last reply (a refusal, say)
            // is still in the writer; the reason waits for that to be sent.
            let mut ended: Option<String> = None;
            let reason = loop {
                tokio::select! {
                    message = source.next() => {
                        match message {
                            Some(Ok(Message::Binary(bytes))) => {
                                last_seen = tokio::time::Instant::now();
                                if input_send.try_send(bytes.to_vec()).is_err() { break "input queue full".to_string(); }
                            }
                            Some(Ok(Message::Ping(bytes))) => {
                                last_seen = tokio::time::Instant::now();
                                if pong_send.try_send(Message::Pong(bytes)).is_err() { break "pong queue full".to_string(); }
                            }
                            Some(Ok(Message::Pong(_))) => { last_seen = tokio::time::Instant::now(); }
                            Some(Ok(Message::Close(frame))) => break format!("phone closed ({})", frame.map_or("no code".into(), |f| u16::from(f.code).to_string())),
                            Some(Ok(_)) => break "unexpected text frame".to_string(),
                            Some(Err(error)) => break format!("socket error: {error}"),
                            None => break "socket ended".to_string(),
                        }
                    }
                    _ = idle_check.tick() => {
                        if last_seen.elapsed() > Duration::from_secs(65) { break "no pong for 65s".to_string(); }
                    }
                    _ = &mut writer => break ended.take().unwrap_or_else(|| "send stalled or failed".to_string()),
                    result = &mut task, if ended.is_none() => {
                        ended = Some(match result {
                            Ok(Ok(())) => "connection finished".to_string(),
                            Ok(Err(error)) => error,
                            Err(_) => "connection task stopped".to_string(),
                        });
                    }
                }
            };
            eprintln!("Nearby phone {} disconnected: {reason}", peer.ip());
            writer.abort();
            task.abort();
        });
    }
}
