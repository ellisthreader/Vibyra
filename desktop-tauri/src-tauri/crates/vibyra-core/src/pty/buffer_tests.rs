use std::time::Duration;

use super::buffer::{Drained, SessionOutput};
use super::Visibility;

#[test]
fn drains_pushed_bytes_as_text() {
    let mut out = SessionOutput::new(4096, 4096);
    out.push(b"hello ");
    out.push(b"world");
    match out.drain() {
        Drained::Chunk(text) => assert_eq!(text, "hello world"),
        _ => panic!("expected chunk"),
    }
    assert!(matches!(out.drain(), Drained::Nothing));
}

#[test]
fn overflow_switches_to_resync_with_scrollback_tail() {
    let mut out = SessionOutput::new(4096, 8);
    out.push(&vec![b'x'; 5000]);
    out.push(b"tail-end");
    match out.drain() {
        Drained::Resync(snapshot) => assert_eq!(snapshot, "tail-end"),
        _ => panic!("expected resync"),
    }
    assert!(matches!(out.drain(), Drained::Nothing));
}

#[test]
fn split_utf8_char_waits_for_completion() {
    let mut out = SessionOutput::new(4096, 4096);
    let bytes = "🦀".as_bytes();
    out.push(&bytes[..2]);
    assert!(matches!(out.drain(), Drained::Nothing));
    out.push(&bytes[2..]);
    match out.drain() {
        Drained::Chunk(text) => assert_eq!(text, "🦀"),
        _ => panic!("expected chunk"),
    }
}

#[test]
fn only_output_someone_will_see_wakes_the_flusher() {
    let mut out = SessionOutput::new(4096, 4096);
    assert!(out.push(b"a"));
    out.visibility = Visibility::Hidden;
    assert!(!out.push(b"b"), "already waiting for the hidden interval");
    assert!(matches!(out.drain(), Drained::Chunk(text) if text == "ab"));
    assert!(out.push(b"c"), "idle to busy arms the flusher's timer");
    assert!(!out.due(Duration::from_secs(60)));
    assert!(out.push(&[b'x'; 2048]), "half full is flushed early");
    assert!(out.due(Duration::from_secs(60)));
    out.visibility = Visibility::Hibernated;
    let _ = out.drain();
    assert!(!out.push(b"unseen"));
    assert!(!out.has_pending(), "a wake resyncs from the ring instead");
    assert!(out.snapshot().ends_with("xunseen"));
}

#[test]
fn a_resync_replays_a_bounded_tail() {
    let mut out = SessionOutput::new(4096, 4 * 1024 * 1024);
    out.push(&vec![b'y'; 3 * 1024 * 1024]);
    out.push(b"end");
    let Drained::Resync(snapshot) = out.drain() else {
        panic!("expected resync");
    };
    assert_eq!(snapshot.len(), 1024 * 1024);
    assert!(snapshot.ends_with("yend"));
    assert_eq!(out.snapshot_tail(4), "yend");
}

#[test]
fn held_output_waits_for_its_view_and_overflows_into_one_resync() {
    let mut out = SessionOutput::new(4096, 64 * 1024);
    out.hold(true);
    assert!(out.is_held());
    assert!(
        !out.push(b"waiting"),
        "a held pane does not wake the flusher"
    );
    assert!(!out.due(Duration::ZERO), "nor is it drained");
    out.push(&[b'z'; 8192]);
    out.hold(false);
    assert!(out.due(Duration::from_secs(60)));
    let Drained::Resync(snapshot) = out.drain() else {
        panic!("a flood held past the cap resyncs from the ring");
    };
    assert!(snapshot.starts_with("waiting") && snapshot.ends_with('z'));
    out.hold(true);
    let _ = out.force_resync();
    assert!(
        !out.is_held(),
        "a view rebuilt from a snapshot starts unheld"
    );
}
