use super::{Frame, StreamKey, MAX_CHUNK};
use std::collections::VecDeque;

/// A receiver never promises more than this many unread bytes for one stream.
pub const WINDOW_BYTES: usize = 4 * MAX_CHUNK;

/// One sending direction of a stream. Credit is cumulative, so a repeated
/// control frame cannot grant the same bytes twice after a reconnect.
pub struct SendWindow {
    key: StreamKey,
    allowed_total: u64,
    sent_total: u64,
    next_sequence: u32,
    closed: bool,
    ended: bool,
}
impl SendWindow {
    pub fn new(key: StreamKey) -> Self {
        Self {
            key,
            allowed_total: 0,
            sent_total: 0,
            next_sequence: 0,
            closed: false,
            ended: false,
        }
    }
    pub fn available(&self) -> usize {
        if self.closed {
            0
        } else {
            (self.allowed_total - self.sent_total) as usize
        }
    }
    pub fn apply_credit(&mut self, frame: &Frame) -> Result<(), &'static str> {
        let Frame::Credit { key, total } = frame else {
            return Err("Expected Preview credit");
        };
        // A receiver may acknowledge data still queued on the shared Noise
        // socket after End was produced. Those ACKs cannot reopen the stream.
        if *key != self.key || (self.closed && !self.ended) {
            return Err("Preview stream is stale or closed");
        }
        if *total < self.allowed_total
            || *total > self.sent_total.saturating_add(WINDOW_BYTES as u64)
        {
            return Err("Invalid Preview credit window");
        }
        self.allowed_total = *total;
        Ok(())
    }
    pub fn data(&mut self, bytes: Vec<u8>) -> Result<Frame, &'static str> {
        if self.closed {
            return Err("Preview stream is closed");
        }
        if bytes.is_empty() || bytes.len() > MAX_CHUNK || bytes.len() > self.available() {
            return Err("Preview chunk exceeds available credit");
        }
        let next = self
            .next_sequence
            .checked_add(1)
            .ok_or("Preview sequence exhausted")?;
        let len = bytes.len();
        let frame = Frame::Data {
            key: self.key,
            sequence: self.next_sequence,
            bytes,
        };
        self.sent_total += len as u64;
        self.next_sequence = next;
        Ok(frame)
    }
    pub fn end(&mut self) -> Result<Frame, &'static str> {
        if self.closed {
            return Err("Preview stream is closed");
        }
        self.closed = true;
        self.ended = true;
        Ok(Frame::End {
            key: self.key,
            sequence: self.next_sequence,
        })
    }
    pub fn cancel(&mut self) -> Frame {
        self.closed = true;
        self.ended = false;
        Frame::Cancel { key: self.key }
    }
    pub fn accept_cancel(&mut self, frame: &Frame) -> Result<(), &'static str> {
        if *frame != (Frame::Cancel { key: self.key }) {
            return Err("Wrong Preview cancellation");
        }
        self.closed = true;
        self.ended = false;
        Ok(())
    }
    pub fn revoke(&mut self) {
        self.closed = true;
        self.ended = false;
    }
}

/// One receiving direction. It owns the unread chunks, so the memory promise
/// remains enforceable even when the consumer pauses or the WebView disappears.
pub struct ReceiveWindow {
    key: StreamKey,
    granted_total: u64,
    received_total: u64,
    next_sequence: u32,
    queued_bytes: usize,
    queue: VecDeque<Vec<u8>>,
    closed: bool,
    ended: bool,
}
impl ReceiveWindow {
    pub fn new(key: StreamKey) -> Self {
        Self {
            key,
            granted_total: WINDOW_BYTES as u64,
            received_total: 0,
            next_sequence: 0,
            queued_bytes: 0,
            queue: VecDeque::new(),
            closed: false,
            ended: false,
        }
    }
    pub fn initial_credit(&self) -> Frame {
        Frame::Credit {
            key: self.key,
            total: self.granted_total,
        }
    }
    pub fn queued_bytes(&self) -> usize {
        self.queued_bytes
    }
    pub fn ended(&self) -> bool {
        self.ended
    }
    pub fn accept(&mut self, frame: Frame) -> Result<(), &'static str> {
        if frame.key() != self.key {
            return Err("Preview stream or generation mismatch");
        }
        if self.closed {
            return Err("Preview stream is closed");
        }
        match frame {
            Frame::Data {
                sequence, bytes, ..
            } if !self.ended => {
                if sequence != self.next_sequence {
                    return Err("Preview chunk out of order");
                }
                if bytes.is_empty()
                    || bytes.len() > MAX_CHUNK
                    || bytes.len() > WINDOW_BYTES - self.queued_bytes
                    || self.received_total.saturating_add(bytes.len() as u64) > self.granted_total
                {
                    return Err("Preview receive window exceeded");
                }
                self.next_sequence = self
                    .next_sequence
                    .checked_add(1)
                    .ok_or("Preview sequence exhausted")?;
                self.received_total += bytes.len() as u64;
                self.queued_bytes += bytes.len();
                self.queue.push_back(bytes);
                Ok(())
            }
            Frame::End { sequence, .. } if !self.ended && sequence == self.next_sequence => {
                self.ended = true;
                Ok(())
            }
            Frame::Cancel { .. } => {
                self.revoke();
                Ok(())
            }
            _ => Err("Invalid or duplicate Preview stream frame"),
        }
    }
    /// Returns consumed bytes and the cumulative replacement credit. The caller
    /// sends credit on its control lane before accepting further bulk data.
    pub fn pop(&mut self) -> Option<(Vec<u8>, Frame)> {
        if self.closed {
            return None;
        }
        let next_grant = self
            .granted_total
            .checked_add(self.queue.front()?.len() as u64)?;
        let bytes = self.queue.pop_front()?;
        self.queued_bytes -= bytes.len();
        self.granted_total = next_grant;
        let credit = Frame::Credit {
            key: self.key,
            total: self.granted_total,
        };
        Some((bytes, credit))
    }
    pub fn revoke(&mut self) {
        self.closed = true;
        self.queue.clear();
        self.queued_bytes = 0;
    }
}
