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
    accept_async_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
};

#[cfg(feature = "standalone")]
pub async fn serve(listener: TcpListener, shared: Arc<Shared>) -> Result<(), String> {
    serve_with_policy(listener, shared, false).await
}

pub async fn serve_with_policy(
    listener: TcpListener,
    shared: Arc<Shared>,
    lan_only: bool,
) -> Result<(), String> {
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let permits = Arc::new(Semaphore::new(32));
    loop {
        let (mut stream, peer) = listener.accept().await.map_err(|e| e.to_string())?;
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
            let accepted = tokio::time::timeout(
                Duration::from_secs(5),
                accept_async_with_config(stream, Some(config)),
            )
            .await;
            let Ok(Ok(socket)) = accepted else { return };
            let (input_send, input_receive) = mpsc::channel(32);
            let (output_send, mut output_receive) = mpsc::channel(32);
            let task = tokio::spawn(connection::run_from(
                shared,
                input_receive,
                output_send,
                Origin::Nearby(peer.ip().to_string()),
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
            loop {
                tokio::select! {
                    message = source.next() => {
                        match message {
                            Some(Ok(Message::Binary(bytes))) => {
                                last_seen = tokio::time::Instant::now();
                                if input_send.try_send(bytes.to_vec()).is_err() { break; }
                            }
                            Some(Ok(Message::Ping(bytes))) => {
                                last_seen = tokio::time::Instant::now();
                                if pong_send.try_send(Message::Pong(bytes)).is_err() { break; }
                            }
                            Some(Ok(Message::Pong(_))) => { last_seen = tokio::time::Instant::now(); }
                            _ => break,
                        }
                    }
                    _ = idle_check.tick() => {
                        if last_seen.elapsed() > Duration::from_secs(65) { break; }
                    }
                    _ = &mut writer => break,
                }
            }
            writer.abort();
            task.abort();
        });
    }
}
