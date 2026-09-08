use crate::{connection, state::Shared};
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

pub async fn serve(listener: TcpListener, shared: Arc<Shared>) -> Result<(), String> {
    let permits = Arc::new(Semaphore::new(32));
    loop {
        let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let Ok(permit) = permits.clone().try_acquire_owned() else {
            continue;
        };
        let shared = shared.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let config = WebSocketConfig::default()
                .max_message_size(Some(vibyra_transport::MAX_FRAME))
                .max_frame_size(Some(vibyra_transport::MAX_FRAME));
            let accepted = tokio::time::timeout(
                Duration::from_secs(5),
                accept_async_with_config(stream, Some(config)),
            )
            .await;
            let Ok(Ok(mut socket)) = accepted else { return };
            let (input_send, input_receive) = mpsc::channel(32);
            let (output_send, mut output_receive) = mpsc::channel(32);
            let task = tokio::spawn(connection::run(shared, input_receive, output_send));
            let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
            let mut last_seen = tokio::time::Instant::now();
            loop {
                tokio::select! {
                    message = socket.next() => {
                        match message {
                            Some(Ok(Message::Binary(bytes))) => {
                                last_seen = tokio::time::Instant::now();
                                if input_send.try_send(bytes.to_vec()).is_err() { break; }
                            }
                            Some(Ok(Message::Ping(bytes))) => { if socket.send(Message::Pong(bytes)).await.is_err() { break; } }
                            Some(Ok(Message::Pong(_))) => { last_seen = tokio::time::Instant::now(); }
                            _ => break,
                        }
                    }
                    frame = output_receive.recv() => {
                        let Some(frame) = frame else { break };
                        if !matches!(tokio::time::timeout(Duration::from_secs(10), socket.send(Message::Binary(frame.into()))).await,
                            Ok(Ok(()))) { break; }
                    }
                    _ = heartbeat.tick() => {
                        if last_seen.elapsed() > Duration::from_secs(65) { break; }
                        if socket.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
                    }
                }
            }
            task.abort();
            let _ = socket.close(None).await;
        });
    }
}
