use vibyra_transport::preview::{ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK, WINDOW_BYTES};

#[test]
fn ten_megabytes_stays_within_the_receive_window() {
    let key = StreamKey::new(100, 300).unwrap();
    let mut sender = SendWindow::new(key);
    let mut receiver = ReceiveWindow::new(key);
    sender.apply_credit(&receiver.initial_credit()).unwrap();
    let mut remaining = 10 * 1024 * 1024;
    let mut sent_sum = 0u64;
    let mut read_sum = 0u64;
    let mut iteration = 0usize;
    while remaining > 0 {
        let len = ((iteration * 7919) % MAX_CHUNK + 1).min(remaining);
        while sender.available() < len {
            let (bytes, credit) = receiver.pop().expect("queued credit must be available");
            read_sum += bytes.iter().map(|byte| u64::from(*byte)).sum::<u64>();
            sender.apply_credit(&credit).unwrap();
        }
        let bytes = vec![(iteration % 251) as u8; len];
        sent_sum += bytes.iter().map(|byte| u64::from(*byte)).sum::<u64>();
        receiver.accept(sender.data(bytes).unwrap()).unwrap();
        assert!(receiver.queued_bytes() <= WINDOW_BYTES);
        remaining -= len;
        iteration += 1;
    }
    receiver.accept(sender.end().unwrap()).unwrap();
    while let Some((bytes, _)) = receiver.pop() {
        read_sum += bytes.iter().map(|byte| u64::from(*byte)).sum::<u64>();
    }
    assert!(receiver.ended());
    assert_eq!(read_sum, sent_sum);
    assert_eq!(receiver.queued_bytes(), 0);
}
