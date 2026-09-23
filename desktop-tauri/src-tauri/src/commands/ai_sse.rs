//! A pure reader for OpenAI's server-sent-event stream: bytes in, frames out.
//! No I/O and no runtime here, so the framing rules can be tested on their own
//! rather than against a live model.

use serde_json::Value;

/// A megabyte with no frame terminator is not a slow reply, it is a broken or
/// hostile stream, and the buffer must not grow behind it without limit.
const MAX_BUFFER: usize = 1024 * 1024;

pub enum Frame {
    Text(String),
    /// One fragment of a tool call. The model streams these in pieces — the id
    /// and name arrive once, the arguments a few characters at a time — so the
    /// reader emits fragments and the caller reassembles them by index.
    Tool {
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments: String,
    },
    Usage {
        input_tokens: u64,
        output_tokens: u64,
    },
    Error(String),
    Done,
}

#[derive(Default)]
pub struct SseReader {
    buffer: Vec<u8>,
}

impl SseReader {
    pub fn new() -> Self {
        Self::default()
    }

    /// Splits on a blank line so a frame is only ever decoded once it is
    /// whole. That is also what carries a multi-byte character across a chunk
    /// boundary: a UTF-8 continuation byte is never `0x0A`, so half a
    /// character can never look like a terminator.
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Frame>, String> {
        self.buffer.extend_from_slice(bytes);
        let mut frames = Vec::new();
        while let Some((end, skip)) = terminator(&self.buffer) {
            let mut raw: Vec<u8> = self.buffer.drain(..end + skip).collect();
            raw.truncate(end);
            // Never lossy: a replacement character here would hide a real
            // framing bug behind a reply that merely looks slightly wrong.
            let block = String::from_utf8(raw)
                .map_err(|_| "the reply stream sent text we could not read".to_string())?;
            frames.extend(decode(&block));
        }
        if self.buffer.len() > MAX_BUFFER {
            return Err("the reply stream sent a frame that never ended".into());
        }
        Ok(frames)
    }
}

/// The end of the first complete frame: where its payload stops, and how many
/// bytes of terminator follow it.
fn terminator(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|pair| pair == b"\n\n");
    let crlf = buffer.windows(4).position(|quad| quad == b"\r\n\r\n");
    lf.map(|at| (at, 2))
        .into_iter()
        .chain(crlf.map(|at| (at, 4)))
        .min_by_key(|(at, _)| *at)
}

/// One frame's `data:` payload. Comment lines (the `:` keep-alives a proxy
/// sends to hold the connection open) and every other field are ignored, and
/// a value spread over several `data:` lines is rejoined as the spec says.
fn decode(block: &str) -> Option<Frame> {
    let mut data = String::new();
    for line in block.lines() {
        let Some(value) = line.strip_prefix("data:") else {
            continue;
        };
        if !data.is_empty() {
            data.push('\n');
        }
        data.push_str(value.strip_prefix(' ').unwrap_or(value));
    }
    let data = data.trim();
    if data.is_empty() {
        return None;
    }
    if data == "[DONE]" {
        return Some(Frame::Done);
    }
    // A proxy in the way can inject something that is not JSON at all. One
    // unreadable frame is not a reason to throw away a reply that is
    // otherwise arriving, so it is skipped rather than fatal.
    frame(&serde_json::from_str::<Value>(data).ok()?)
}

fn frame(value: &Value) -> Option<Frame> {
    if let Some(message) = value["error"]["message"].as_str() {
        return Some(Frame::Error(message.to_string()));
    }
    // The usage chunk carries `"choices": []`, so it has to be read before the
    // delta or the end of every reply looks like an empty one.
    if let Some(usage) = value.get("usage").filter(|usage| usage.is_object()) {
        return Some(Frame::Usage {
            input_tokens: usage["prompt_tokens"].as_u64().unwrap_or(0),
            output_tokens: usage["completion_tokens"].as_u64().unwrap_or(0),
        });
    }
    if let Some(call) = value["choices"][0]["delta"]["tool_calls"][0].as_object() {
        let function = &value["choices"][0]["delta"]["tool_calls"][0]["function"];
        return Some(Frame::Tool {
            index: call.get("index").and_then(Value::as_u64).unwrap_or(0) as usize,
            id: call.get("id").and_then(Value::as_str).map(String::from),
            name: function["name"].as_str().map(String::from),
            arguments: function["arguments"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
        });
    }
    // Role-only openers and `finish_reason` closers land here with nothing to
    // append, and produce no frame at all.
    value["choices"][0]["delta"]["content"]
        .as_str()
        .filter(|text| !text.is_empty())
        .map(|text| Frame::Text(text.to_string()))
}
