use super::*;
use std::sync::mpsc;
use std::time::{Duration, Instant};

struct BlockedWriter {
    entered: mpsc::Sender<()>,
    release: mpsc::Receiver<()>,
    first: bool,
}

impl Write for BlockedWriter {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if self.first {
            self.first = false;
            let _ = self.entered.send(());
            self.release.recv_timeout(Duration::from_secs(10)).unwrap();
        }
        Ok(data.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn full_input_budget_rejects_atomically_and_recovers_after_drain() {
    let (entered, started) = mpsc::channel();
    let (release, blocked) = mpsc::channel();
    let writer = SessionWriter::spawn(
        1,
        Box::new(BlockedWriter {
            entered,
            release: blocked,
            first: true,
        }),
    )
    .unwrap();
    writer
        .queue(1, &vec![b'x'; MAX_PENDING_INPUT_BYTES])
        .unwrap();
    started.recv_timeout(Duration::from_secs(5)).unwrap();
    let begin = Instant::now();
    assert!(writer
        .queue(1, b"not partially sent")
        .unwrap_err()
        .to_string()
        .contains("not sent"));
    assert!(begin.elapsed() < Duration::from_secs(1));
    assert_eq!(
        writer.pending.load(Ordering::Acquire),
        MAX_PENDING_INPUT_BYTES
    );
    release.send(()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while writer.pending.load(Ordering::Acquire) != 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(writer.pending.load(Ordering::Acquire), 0);
    writer.queue(1, b"recovered").unwrap();
}

#[test]
fn small_messages_are_count_bounded_and_failed_admission_releases_its_bytes() {
    let (entered, started) = mpsc::channel();
    let (release, blocked) = mpsc::channel();
    let writer = SessionWriter::spawn(
        1,
        Box::new(BlockedWriter {
            entered,
            release: blocked,
            first: true,
        }),
    )
    .unwrap();
    writer.queue(1, b"x").unwrap();
    started.recv_timeout(Duration::from_secs(5)).unwrap();
    for _ in 0..MAX_PENDING_INPUT_MESSAGES {
        writer.queue(1, b"x").unwrap();
    }
    assert!(writer.queue(1, b"extra").is_err());
    assert_eq!(
        writer.pending.load(Ordering::Acquire),
        MAX_PENDING_INPUT_MESSAGES + 1
    );
    release.send(()).unwrap();
}
