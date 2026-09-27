use vibyra_transport::preview::{ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK};

#[test]
fn acknowledgements_after_normal_end_do_not_cancel_queued_tail() {
    let key = StreamKey::new(81, 95).unwrap();
    let mut sender = SendWindow::new(key);
    let mut receiver = ReceiveWindow::new(key);
    sender.apply_credit(&receiver.initial_credit()).unwrap();
    for _ in 0..4 {
        receiver
            .accept(sender.data(vec![7; MAX_CHUNK]).unwrap())
            .unwrap();
    }
    receiver.accept(sender.end().unwrap()).unwrap();
    for _ in 0..4 {
        let (_, late_ack) = receiver.pop().unwrap();
        sender.apply_credit(&late_ack).unwrap();
    }
    assert_eq!(sender.available(), 0);
    assert!(sender.data(vec![1]).is_err());
    sender.cancel();
    assert!(sender.apply_credit(&receiver.initial_credit()).is_err());
}
