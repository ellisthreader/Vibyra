//! Accepting questions from bridge processes.
//!
//! One thread per connection, because a question can wait half an hour for
//! an answer and the next turn's question must not queue behind it.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::decide::{answer, PATIENCE};

/// The most a question may be, in bytes, before it is dropped unread.
const QUESTION_LIMIT: u64 = 64 * 1024;
use crate::agent_mode::bridge::wire::{BridgeReply, BridgeRequest};
use crate::agent_mode::hub::AgentHub;

pub(super) fn spawn(app: AppHandle, hub: Arc<AgentHub>, listener: TcpListener, token: String) {
    std::thread::Builder::new()
        .name("vibyra-permission-gate".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else {
                    // Descriptor exhaustion makes accept fail on every call;
                    // without a pause this thread would spin at full speed.
                    std::thread::sleep(Duration::from_millis(200));
                    continue;
                };
                let app = app.clone();
                let hub = Arc::clone(&hub);
                let token = token.clone();
                let _ = std::thread::Builder::new()
                    .name("vibyra-permission-question".into())
                    .spawn(move || serve(app, hub, stream, &token));
            }
        })
        .ok();
}

fn serve(app: AppHandle, hub: Arc<AgentHub>, mut stream: TcpStream, token: &str) {
    // The question arrives at once or not at all; only the answer is slow.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut line = String::new();
    let Ok(mut reader) = stream.try_clone().map(BufReader::new) else {
        return;
    };
    // A question is one line and a few kilobytes; nothing legitimate needs
    // more, and a caller that never sends a newline must not grow a string
    // for ever before the token is even checked.
    if (&mut reader)
        .take(QUESTION_LIMIT)
        .read_line(&mut line)
        .is_err()
        || !line.ends_with('\n')
    {
        return;
    }
    let reply = match serde_json::from_str::<BridgeRequest>(line.trim()) {
        Err(error) => BridgeReply::deny(format!("Vibyra could not read the question: {error}")),
        Ok(request) => match hub.current() {
            None => {
                BridgeReply::deny("No Vibyra account is signed in, so nothing can be approved.")
            }
            Some(world) => answer(
                &world,
                token,
                request,
                &|card| {
                    let _ = app.emit("approval-raised", card);
                },
                PATIENCE,
            ),
        },
    };
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
    if let Ok(mut text) = serde_json::to_string(&reply) {
        text.push('\n');
        let _ = stream.write_all(text.as_bytes());
    }
}
