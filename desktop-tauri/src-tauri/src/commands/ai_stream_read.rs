//! The read loop: bytes off the socket, frames folded into one reply, and a
//! flush every 16 ms. Split from `ai_stream`, which owns the request around
//! it; together they crossed the 200-line limit.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use tauri::ipc::Channel;

use super::ai::ChatDelta;
use super::ai_sse::{Frame, SseReader};
use super::ai_stream::{Streamed, FLUSH, POLL};

pub(super) async fn read(
    mut response: reqwest::Response,
    on_event: &Channel<ChatDelta>,
    cancel: &AtomicBool,
) -> Streamed {
    let mut reader = SseReader::new();
    let mut out = Streamed::default();
    let mut pending = String::new();
    let mut flushed = Instant::now();
    let mut ended = false;
    while !ended {
        if cancel.load(Ordering::Relaxed) {
            out.stopped = true;
            break;
        }
        let chunk = match tokio::time::timeout(POLL, response.chunk()).await {
            Err(_) => {
                flush(on_event, &mut pending, &mut flushed);
                continue;
            }
            Ok(Ok(Some(chunk))) => chunk,
            Ok(Ok(None)) => break,
            Ok(Err(_)) => {
                out.error = Some("The reply stopped early. Please try again.".into());
                break;
            }
        };
        match reader.push(&chunk) {
            Ok(frames) => ended = collect(frames, &mut out, &mut pending),
            Err(error) => {
                out.error = Some(error);
                ended = true;
            }
        }
        if ended || flushed.elapsed() >= FLUSH {
            flush(on_event, &mut pending, &mut flushed);
        }
    }
    check_completion(&mut out, ended);
    flush(on_event, &mut pending, &mut flushed);
    out
}

fn check_completion(out: &mut Streamed, ended: bool) {
    if !ended && !out.stopped && out.error.is_none() {
        out.error = Some("The reply stopped early. Please try again.".into());
    }
}

/// Folds one chunk's frames into the reply so far. True once the stream has
/// said it is over, either with `[DONE]` or with an error.
fn collect(frames: Vec<Frame>, out: &mut Streamed, pending: &mut String) -> bool {
    let mut ended = false;
    for frame in frames {
        match frame {
            Frame::Text(text) => {
                out.text.push_str(&text);
                pending.push_str(&text);
            }
            Frame::Tool {
                index,
                id,
                name,
                arguments,
            } => {
                let call = out.tools.entry(index).or_default();
                if let Some(id) = id {
                    call.id = id;
                }
                if let Some(name) = name {
                    call.name = name;
                }
                call.arguments.push_str(&arguments);
            }
            Frame::Usage {
                input_tokens,
                output_tokens,
            } => out.usage = Some((input_tokens, output_tokens)),
            Frame::Error(message) => {
                out.error = Some(message);
                ended = true;
            }
            Frame::Done => ended = true,
        }
    }
    ended
}

fn flush(on_event: &Channel<ChatDelta>, pending: &mut String, flushed: &mut Instant) {
    if pending.is_empty() {
        return;
    }
    let _ = on_event.send(ChatDelta {
        text: std::mem::take(pending),
    });
    *flushed = Instant::now();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn eof_cannot_turn_an_interrupted_reply_into_success() {
        let mut partial = Streamed {
            text: "Partial reply".into(),
            ..Streamed::default()
        };
        check_completion(&mut partial, false);
        assert!(partial.error.is_some());
        assert_eq!(partial.text, "Partial reply");
        let mut stopped = Streamed {
            stopped: true,
            ..Streamed::default()
        };
        check_completion(&mut stopped, false);
        assert!(stopped.error.is_none());
        let mut complete = Streamed::default();
        check_completion(&mut complete, true);
        assert!(complete.error.is_none());
    }
}
