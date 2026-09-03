//! Accepting questions from bridge processes.
//!
//! One thread per connection, because a question can wait half an hour for
//! an answer and the next turn's question must not queue behind it.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::decide::{answer, PATIENCE};
use crate::agent_mode::bridge::wire::{BridgeReply, BridgeRequest};
use crate::agent_mode::hub::AgentHub;

pub(super) fn spawn(app: AppHandle, hub: Arc<AgentHub>, listener: TcpListener, token: String) {
    std::thread::Builder::new()
        .name("vibyra-permission-gate".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
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
    if reader.read_line(&mut line).is_err() {
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
