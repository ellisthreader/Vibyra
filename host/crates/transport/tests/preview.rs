use vibyra_transport::preview::{
    Frame, FrameQueue, ReceiveWindow, SendWindow, StreamKey, MAX_CHUNK, WINDOW_BYTES,
};
use vibyra_transport::MAX_PLAINTEXT;

fn key() -> StreamKey {
    StreamKey::new(7, 9).unwrap()
}

#[test]
fn wire_round_trips_every_frame_and_rejects_malformed_or_oversize_chunks() {
    let key = key();
    for size in [1, 2, 127, MAX_CHUNK - 1, MAX_CHUNK] {
        let frames = [
            Frame::Open { key },
            Frame::Credit {
                key,
                total: WINDOW_BYTES as u64,
            },
            Frame::Data {
                key,
                sequence: 3,
                bytes: vec![42; size],
            },
            Frame::End { key, sequence: 4 },
            Frame::Cancel { key },
        ];
        for frame in frames {
            let encoded = frame.encode().unwrap();
            assert!(encoded.len() <= MAX_PLAINTEXT);
            assert_eq!(Frame::decode(&encoded).unwrap(), frame);
        }
    }
    assert!(Frame::Data {
        key,
        sequence: 0,
        bytes: vec![]
    }
    .encode()
    .is_err());
    assert!(Frame::Data {
        key,
        sequence: 0,
        bytes: vec![0; MAX_CHUNK + 1]
    }
    .encode()
    .is_err());
    assert!(Frame::decode(&vec![0; MAX_PLAINTEXT + 1]).is_err());
    let mut open = Frame::Open { key }.encode().unwrap();
    open.push(0);
    assert!(Frame::decode(&open).is_err());
    open[2] = 2;
    assert!(Frame::decode(&open).is_err());
    assert!(StreamKey::new(0, 9).is_err());
    assert!(StreamKey::new(7, 0).is_err());
}

#[test]
fn cumulative_credit_never_replays_or_exceeds_one_window() {
    let key = key();
    let mut sender = SendWindow::new(key);
    let mut receiver = ReceiveWindow::new(key);
    assert!(sender.data(vec![1]).is_err());
    let credit = receiver.initial_credit();
    sender.apply_credit(&credit).unwrap();
    sender.apply_credit(&credit).unwrap();
    assert_eq!(sender.available(), WINDOW_BYTES);
    assert!(sender
        .apply_credit(&Frame::Credit {
            key,
            total: (WINDOW_BYTES + 1) as u64
        })
        .is_err());
    for sequence in 0..4 {
        let frame = sender.data(vec![sequence as u8; MAX_CHUNK]).unwrap();
        receiver.accept(frame).unwrap();
    }
    assert_eq!(sender.available(), 0);
    assert_eq!(receiver.queued_bytes(), WINDOW_BYTES);
    assert!(sender.data(vec![1]).is_err());
    let (chunk, replacement) = receiver.pop().unwrap();
    assert_eq!(chunk.len(), MAX_CHUNK);
    sender.apply_credit(&replacement).unwrap();
    assert_eq!(sender.available(), MAX_CHUNK);
    assert!(sender.apply_credit(&credit).is_err());
    receiver
        .accept(sender.data(vec![8; MAX_CHUNK]).unwrap())
        .unwrap();
    assert_eq!(receiver.queued_bytes(), WINDOW_BYTES);
}

#[test]
fn ordering_generation_end_and_revocation_are_enforced() {
    let key = key();
    let mut receiver = ReceiveWindow::new(key);
    let first = Frame::Data {
        key,
        sequence: 0,
        bytes: vec![1, 2],
    };
    assert!(receiver
        .accept(Frame::Data {
            key,
            sequence: 1,
            bytes: vec![3]
        })
        .is_err());
    receiver.accept(first.clone()).unwrap();
    assert!(receiver.accept(first).is_err());
    assert!(receiver
        .accept(Frame::Data {
            key: StreamKey::new(7, 10).unwrap(),
            sequence: 1,
            bytes: vec![3],
        })
        .is_err());
    assert!(receiver.accept(Frame::End { key, sequence: 0 }).is_err());
    receiver.accept(Frame::End { key, sequence: 1 }).unwrap();
    assert!(receiver.ended());
    assert!(receiver
        .accept(Frame::Data {
            key,
            sequence: 1,
            bytes: vec![3]
        })
        .is_err());
    assert!(receiver.accept(Frame::End { key, sequence: 1 }).is_err());
    receiver.revoke();
    assert_eq!(receiver.queued_bytes(), 0);
    assert!(receiver.pop().is_none());
    assert!(receiver.accept(Frame::Cancel { key }).is_err());
}

#[test]
fn cancel_closes_windows_and_discards_queued_bulk_without_affecting_other_streams() {
    let key = key();
    let other = StreamKey::new(8, 9).unwrap();
    let mut sender = SendWindow::new(key);
    let mut receiver = ReceiveWindow::new(key);
    sender.apply_credit(&receiver.initial_credit()).unwrap();
    receiver
        .accept(sender.data(vec![7; 1024]).unwrap())
        .unwrap();
    let cancel = sender.cancel();
    receiver.accept(cancel.clone()).unwrap();
    assert_eq!(receiver.queued_bytes(), 0);
    assert!(sender.data(vec![1]).is_err());
    assert!(receiver.pop().is_none());

    let mut queue = FrameQueue::new();
    queue.push(Frame::Open { key }).unwrap();
    queue
        .push(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![1; MAX_CHUNK],
        })
        .unwrap();
    queue
        .push(Frame::Data {
            key: other,
            sequence: 0,
            bytes: vec![2],
        })
        .unwrap();
    queue.push(cancel).unwrap();
    assert_eq!(queue.pop(), Some(Frame::Cancel { key }));
    assert_eq!(
        queue.pop(),
        Some(Frame::Data {
            key: other,
            sequence: 0,
            bytes: vec![2]
        })
    );
    assert!(queue.pop().is_none());
}

#[test]
fn queue_is_bounded_and_control_overtakes_bulk() {
    let key = key();
    let mut queue = FrameQueue::new();
    for sequence in 0..7 {
        queue
            .push(Frame::Data {
                key,
                sequence,
                bytes: vec![0; MAX_CHUNK],
            })
            .unwrap();
    }
    assert!(queue.queued_bytes() <= 128 * 1024);
    assert!(queue
        .push(Frame::Data {
            key,
            sequence: 7,
            bytes: vec![0; MAX_CHUNK]
        })
        .is_err());
    queue.push(Frame::Credit { key, total: 99 }).unwrap();
    assert_eq!(queue.pop(), Some(Frame::Credit { key, total: 99 }));
    assert_eq!(
        queue.pop(),
        Some(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![0; MAX_CHUNK]
        })
    );
    for _ in 0..64 {
        queue.push(Frame::Credit { key, total: 99 }).unwrap();
    }
    assert!(queue.push(Frame::Credit { key, total: 99 }).is_err());
}

#[test]
fn queued_open_precedes_its_credit_and_rejected_cancel_keeps_other_frames() {
    let key = key();
    let mut queue = FrameQueue::new();
    queue.push(Frame::Open { key }).unwrap();
    queue.push(Frame::Credit { key, total: 64 }).unwrap();
    assert_eq!(queue.pop(), Some(Frame::Open { key }));
    assert_eq!(queue.pop(), Some(Frame::Credit { key, total: 64 }));

    for id in 10..74 {
        queue
            .push(Frame::Credit {
                key: StreamKey::new(id, 9).unwrap(),
                total: 64,
            })
            .unwrap();
    }
    queue
        .push(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![5],
        })
        .unwrap();
    assert!(queue.push(Frame::Cancel { key }).is_err());
    for _ in 0..8 {
        assert!(matches!(queue.pop(), Some(Frame::Credit { .. })));
    }
    assert_eq!(
        queue.pop(),
        Some(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![5]
        })
    );
    for _ in 0..56 {
        assert!(matches!(queue.pop(), Some(Frame::Credit { .. })));
    }
    assert!(queue.pop().is_none());
}

#[test]
fn continuous_credits_cannot_starve_queued_response_data() {
    let key = key();
    let mut queue = FrameQueue::new();
    queue
        .push(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![42],
        })
        .unwrap();
    for total in 1..=8 {
        queue.push(Frame::Credit { key, total }).unwrap();
        assert_eq!(queue.pop(), Some(Frame::Credit { key, total }));
    }
    queue.push(Frame::Credit { key, total: 9 }).unwrap();
    assert_eq!(
        queue.pop(),
        Some(Frame::Data {
            key,
            sequence: 0,
            bytes: vec![42]
        })
    );
    assert_eq!(queue.pop(), Some(Frame::Credit { key, total: 9 }));
}
