use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::ipc::Channel;
use vibyra_core::pty::{OutputSink, SessionId};

/// Events streamed to the frontend over one IPC channel per terminal.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TermEvent {
    /// Batched output to append.
    Output {
        data: String,
    },
    /// Stream broke (hibernation overflow): reset the view, write snapshot.
    Resync {
        data: String,
    },
    Exit {
        code: Option<i32>,
    },
}

enum Route {
    Attached(Channel<TermEvent>),
    /// Events that arrived before the channel was registered (the flusher
    /// can win the race against create_terminal returning). Replayed on
    /// attach so the first prompt bytes are never dropped.
    Buffered(Vec<TermEvent>),
}

/// OutputSink implementation that forwards batched output from the core
/// flusher thread into Tauri IPC channels.
///
/// Each session owns its own lock. A single map-wide lock made every terminal
/// contend on one mutex for every flush, which with a dozen busy panes on an
/// 8 ms tick is the hottest lock in the app. The outer lock is now held only
/// long enough to clone an `Arc`, never across a channel send.
#[derive(Default)]
pub struct ChannelSink {
    routes: Mutex<HashMap<SessionId, Arc<Mutex<Route>>>>,
}

impl ChannelSink {
    fn route(&self, id: SessionId) -> Arc<Mutex<Route>> {
        Arc::clone(
            self.routes
                .lock()
                .entry(id)
                .or_insert_with(|| Arc::new(Mutex::new(Route::Buffered(Vec::new())))),
        )
    }

    pub fn attach(&self, id: SessionId, channel: Channel<TermEvent>) {
        let route = self.route(id);
        let mut route = route.lock();
        if let Route::Buffered(events) = &mut *route {
            for event in events.drain(..) {
                let _ = channel.send(event);
            }
        }
        *route = Route::Attached(channel);
    }

    pub fn detach(&self, id: SessionId) {
        self.routes.lock().remove(&id);
    }

    fn send(&self, id: SessionId, event: TermEvent) {
        let route = self.route(id);
        let mut route = route.lock();
        match &mut *route {
            Route::Attached(channel) => {
                let _ = channel.send(event);
            }
            Route::Buffered(events) => events.push(event),
        }
    }
}

impl OutputSink for ChannelSink {
    fn on_output(&self, id: SessionId, data: String) {
        self.send(id, TermEvent::Output { data });
    }

    fn on_resync(&self, id: SessionId, snapshot: String) {
        self.send(id, TermEvent::Resync { data: snapshot });
    }

    fn on_exit(&self, id: SessionId, code: Option<i32>) {
        self.send(id, TermEvent::Exit { code });
    }
}
