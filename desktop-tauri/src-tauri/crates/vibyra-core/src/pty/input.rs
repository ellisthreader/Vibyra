use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;

use crate::error::{CoreError, CoreResult};

use super::SessionId;

/// How much input may wait for a program that is not reading it before
/// further writes are refused.
const MAX_QUEUED_BYTES: usize = 8 * 1024 * 1024;

/// Hands a session's input to a thread of its own, in order.
///
/// A PTY write blocks once the kernel's buffer of a few KiB is full, which is
/// exactly what a paste into a busy program does. Written inline, that parked
/// the caller until the program read: a runtime worker for every keystroke
/// after it — until no async command could run at all — or the main thread,
/// and with it the whole window, for the shared CLI.
pub struct InputQueue {
    queue: Sender<Vec<u8>>,
    queued: Arc<AtomicUsize>,
}

impl InputQueue {
    pub fn spawn(id: SessionId, mut writer: Box<dyn Write + Send>) -> CoreResult<Self> {
        let (queue, pending) = channel::<Vec<u8>>();
        let queued = Arc::new(AtomicUsize::new(0));
        let written = Arc::clone(&queued);
        std::thread::Builder::new()
            .name(format!("vibyra-pty-writer-{id}"))
            .spawn(move || {
                // Ends when the session drops its sender, or at the first
                // failed write: a PTY that refuses input is gone, and every
                // later send then reports that instead of queueing.
                for chunk in pending {
                    let result = writer.write_all(&chunk).and_then(|()| writer.flush());
                    written.fetch_sub(chunk.len(), Ordering::SeqCst);
                    if result.is_err() {
                        break;
                    }
                }
            })
            .map_err(CoreError::Io)?;
        Ok(Self { queue, queued })
    }

    /// Queues `data` without waiting for the program to read it. A single
    /// write larger than the cap is still taken when nothing is waiting, so
    /// a big paste into an idle program behaves as it always did.
    pub fn send(&self, data: &[u8]) -> CoreResult<()> {
        if data.is_empty() {
            return Ok(());
        }
        let before = self.queued.fetch_add(data.len(), Ordering::SeqCst);
        if before > 0 && before + data.len() > MAX_QUEUED_BYTES {
            self.queued.fetch_sub(data.len(), Ordering::SeqCst);
            return Err(CoreError::Pty(
                "the program is not reading its input; wait for it to catch up".into(),
            ));
        }
        self.queue.send(data.to_vec()).map_err(|_| {
            CoreError::Io(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "the terminal no longer accepts input",
            ))
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
    use std::time::Duration;

    use super::*;

    /// A writer that blocks until the test lets each write through.
    struct Gate(SyncSender<Vec<u8>>, Arc<parking_lot::Mutex<Receiver<()>>>);

    impl Write for Gate {
        fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
            self.1
                .lock()
                .recv()
                .map_err(|_| std::io::ErrorKind::BrokenPipe)?;
            self.0
                .send(data.to_vec())
                .map_err(|_| std::io::ErrorKind::BrokenPipe)?;
            Ok(data.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn a_blocked_program_neither_blocks_the_caller_nor_reorders_input() {
        let (out_tx, out_rx) = sync_channel(16);
        let (open_tx, open_rx) = sync_channel(16);
        let gate = Gate(out_tx, Arc::new(parking_lot::Mutex::new(open_rx)));
        let input = InputQueue::spawn(7, Box::new(gate)).unwrap();
        input.send(b"first").unwrap();
        input.send(b"second").unwrap();
        let backlog = vec![b'x'; MAX_QUEUED_BYTES];
        assert!(input.send(&backlog).is_err(), "the backlog is capped");
        for _ in 0..2 {
            open_tx.send(()).unwrap();
        }
        let timeout = Duration::from_secs(5);
        assert_eq!(out_rx.recv_timeout(timeout).unwrap(), b"first");
        assert_eq!(out_rx.recv_timeout(timeout).unwrap(), b"second");
        // Drained, the queue takes a single write larger than the cap again.
        let deadline = std::time::Instant::now() + timeout;
        while input.queued.load(Ordering::SeqCst) > 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        input.send(&backlog).unwrap();
        drop(open_tx);
        let deadline = std::time::Instant::now() + timeout;
        while input.send(b"after").is_ok() {
            assert!(
                std::time::Instant::now() < deadline,
                "a failed write closes the queue"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}
