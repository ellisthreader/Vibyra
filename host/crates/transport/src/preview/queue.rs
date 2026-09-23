use super::{Frame, Priority, StreamKey, MAX_CHUNK};
use std::collections::VecDeque;

const MAX_URGENT: usize = 64;
const URGENT_BURST: usize = 8;
const MAX_ORDERED_BYTES: usize = 128 * 1024;

/// A bounded scheduling lane. Credit and cancellation pass bulk Preview data;
/// the caller must schedule terminal and approval frames ahead of this queue.
#[derive(Default)]
pub struct FrameQueue {
    urgent: VecDeque<Frame>,
    ordered: VecDeque<Frame>,
    ordered_bytes: usize,
    urgent_run: usize,
}
impl FrameQueue {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn queued_bytes(&self) -> usize {
        self.ordered_bytes
    }
    pub fn push(&mut self, frame: Frame) -> Result<(), &'static str> {
        if matches!(&frame, Frame::Data { bytes, .. } if bytes.is_empty() || bytes.len() > MAX_CHUNK)
        {
            return Err("Invalid Preview chunk size");
        }
        if let Frame::Cancel { key } = frame {
            if self.urgent.iter().filter(|item| item.key() != key).count() >= MAX_URGENT {
                return Err("Preview control queue full");
            }
            self.discard(key);
            self.urgent.push_back(Frame::Cancel { key });
            return Ok(());
        }
        // A credit for a newly opened stream cannot overtake its Open frame.
        let pending_open = matches!(&frame, Frame::Credit { key, .. }
            if self.ordered.iter().any(|item| matches!(item, Frame::Open { key: open } if open == key)));
        match if pending_open {
            Priority::Ordered
        } else {
            frame.priority()
        } {
            Priority::Urgent if self.urgent.len() < MAX_URGENT => self.urgent.push_back(frame),
            Priority::Urgent => return Err("Preview control queue full"),
            Priority::Ordered if frame.encoded_len() <= MAX_ORDERED_BYTES - self.ordered_bytes => {
                self.ordered_bytes += frame.encoded_len();
                self.ordered.push_back(frame);
            }
            Priority::Ordered => return Err("Preview data queue full"),
        }
        Ok(())
    }
    pub fn pop(&mut self) -> Option<Frame> {
        // Continuous response credits must not keep a queued response body
        // from making progress on a busy page.
        if self.urgent_run < URGENT_BURST || self.ordered.is_empty() {
            if let Some(frame) = self.urgent.pop_front() {
                self.urgent_run += 1;
                return Some(frame);
            }
        }
        let frame = self.ordered.pop_front()?;
        self.ordered_bytes -= frame.encoded_len();
        self.urgent_run = 0;
        Some(frame)
    }
    pub fn discard(&mut self, key: StreamKey) {
        self.urgent.retain(|frame| frame.key() != key);
        self.ordered.retain(|frame| frame.key() != key);
        self.ordered_bytes = self.ordered.iter().map(Frame::encoded_len).sum();
    }
}
