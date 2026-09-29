use super::*;
use serde_json::json;
use std::{
    pin::Pin,
    task::{Context, Poll},
};

fn sessions() -> Sessions {
    Arc::new(Mutex::new(HashSet::from([String::new()])))
}

#[tokio::test]
async fn paced_frames_keep_fifo_while_pongs_overtake_the_wait() {
    let (output, mut received) = mpsc::unbounded_channel();
    let sink = RecordingSink(output);
    let (send, frames) = mpsc::channel(CAPACITY);
    let (control, controls) = mpsc::channel(CONTROL_CAPACITY);
    let writer = run(
        sink,
        frames,
        controls,
        Arc::new(AtomicU64::new(100)),
        sessions(),
    );
    tokio::pin!(writer);
    send.send(json!({"type":"frame", "sequence":1}))
        .await
        .unwrap();
    send.send(json!({"type":"frame", "sequence":2}))
        .await
        .unwrap();
    let checks = async {
        let first = received.recv().await.unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(first.to_text().unwrap()).unwrap()["sequence"],
            1
        );
        control.send(Message::Pong(vec![7].into())).await.unwrap();
        assert_eq!(
            received.recv().await.unwrap(),
            Message::Pong(vec![7].into())
        );
        let second = received.recv().await.unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(second.to_text().unwrap()).unwrap()["sequence"],
            2
        );
    };
    tokio::select! {
        result = &mut writer => panic!("writer stopped: {result:?}"),
        result = tokio::time::timeout(Duration::from_secs(2), checks) => result.unwrap(),
    }
}

struct RecordingSink(mpsc::UnboundedSender<Message>);
impl Sink<Message> for RecordingSink {
    type Error = ();
    fn poll_ready(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Ready(Ok(()))
    }
    fn start_send(self: Pin<&mut Self>, message: Message) -> Result<(), ()> {
        self.0.send(message).map_err(|_| ())
    }
    fn poll_flush(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Ready(Ok(()))
    }
    fn poll_close(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Ready(Ok(()))
    }
}

struct BlockedSink(Arc<std::sync::atomic::AtomicBool>);
impl Drop for BlockedSink {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Relaxed);
    }
}
impl Sink<Message> for BlockedSink {
    type Error = ();
    fn poll_ready(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Pending
    }
    fn start_send(self: Pin<&mut Self>, _: Message) -> Result<(), ()> {
        unreachable!()
    }
    fn poll_flush(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Pending
    }
    fn poll_close(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Result<(), ()>> {
        Poll::Pending
    }
}

#[tokio::test]
async fn stalled_writer_leaves_reader_pollable_and_drops_without_detached_work() {
    let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let (send, frames) = mpsc::channel(CAPACITY);
    let (_control, controls) = mpsc::channel(CONTROL_CAPACITY);
    send.send(json!({"type":"frame"})).await.unwrap();
    let mut writer = Box::pin(run(
        BlockedSink(dropped.clone()),
        frames,
        controls,
        Arc::new(AtomicU64::new(12)),
        sessions(),
    ));
    let read = tokio::time::sleep(Duration::from_millis(10));
    tokio::select! {
        result = &mut writer => panic!("writer stopped: {result:?}"),
        _ = read => {}
    }
    for _ in 0..CAPACITY {
        send.try_send(json!({"type":"frame"})).unwrap();
    }
    assert!(matches!(
        send.try_send(json!({"type":"frame"})),
        Err(mpsc::error::TrySendError::Full(_))
    ));
    drop(writer);
    assert!(dropped.load(Ordering::Relaxed));
    assert!(send.is_closed());
}

#[tokio::test]
async fn disconnect_discards_unsent_frames_but_keeps_close() {
    let (output, mut received) = mpsc::unbounded_channel();
    let (send, frames) = mpsc::channel(CAPACITY);
    let (_control, controls) = mpsc::channel(CONTROL_CAPACITY);
    let live = sessions();
    let writer = run(
        RecordingSink(output),
        frames,
        controls,
        Arc::new(AtomicU64::new(100)),
        live.clone(),
    );
    tokio::pin!(writer);
    for sequence in [1, 2] {
        send.send(json!({"type":"frame", "sequence":sequence}))
            .await
            .unwrap();
    }
    let checks = async {
        assert!(received.recv().await.unwrap().is_text());
        live.lock().unwrap().clear();
        send.send(json!({"type":"client.close"})).await.unwrap();
        let close = received.recv().await.unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(close.to_text().unwrap()).unwrap()["type"],
            "client.close"
        );
    };
    tokio::select! {
        result = &mut writer => panic!("writer stopped: {result:?}"),
        result = tokio::time::timeout(Duration::from_secs(2), checks) => result.unwrap(),
    }
}
