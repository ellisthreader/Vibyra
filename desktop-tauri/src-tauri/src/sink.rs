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
    /// The view let go of a session whose process is still running. What it
    /// still sends — its exit above all — is dropped rather than buffered
    /// for a view that is never coming back, and the exit ends the route.
    Closed,
}

struct Entry {
    route: Route,
    /// Whether the exit has been sent, after which nothing is left to wait
    /// for and letting go removes the route outright.
    exited: bool,
}

/// OutputSink implementation that forwards batched output from the core
/// flusher thread into Tauri IPC channels.
///
/// Each session owns its own lock. A single map-wide lock made every terminal
/// contend on one mutex for every flush, which with a dozen busy panes on an
/// 8 ms tick is the hottest lock in the app. The outer lock is now held only
/// long enough to clone an `Arc`, never across a channel send.
///
/// Lock order is always the map, then a route — never the other way round.
#[derive(Default)]
pub struct ChannelSink {
    routes: Mutex<HashMap<SessionId, Arc<Mutex<Entry>>>>,
}

impl ChannelSink {
    fn route(&self, id: SessionId) -> Arc<Mutex<Entry>> {
        Arc::clone(self.routes.lock().entry(id).or_insert_with(|| {
            Arc::new(Mutex::new(Entry {
                route: Route::Buffered(Vec::new()),
                exited: false,
            }))
        }))
    }

    pub fn attach(&self, id: SessionId, channel: Channel<TermEvent>) {
        let entry = self.route(id);
        let mut entry = entry.lock();
        if let Route::Buffered(events) = &mut entry.route {
            for event in events.drain(..) {
                let _ = channel.send(event);
            }
        }
        entry.route = Route::Attached(channel);
    }

    /// Lets go of a session's view. Removing the route outright let an exit
    /// that raced the removal recreate it as a buffer nothing would drain —
    /// a leak for every pane closed while its process was still running.
    pub fn detach(&self, id: SessionId) {
        self.let_go(id, None);
    }

    /// [`detach`](Self::detach), but only while `channel` is the view still
    /// attached, so a late release from an unmounted view cannot cut off the
    /// one that replaced it. True when it let go.
    pub fn release(&self, id: SessionId, channel: u32) -> bool {
        self.let_go(id, Some(channel))
    }

    fn let_go(&self, id: SessionId, only: Option<u32>) -> bool {
        let mut routes = self.routes.lock();
        let Some(entry) = routes.get(&id).cloned() else {
            return false;
        };
        let mut state = entry.lock();
        let current = match &state.route {
            Route::Attached(channel) => Some(channel.id()),
            _ => None,
        };
        if only.is_some() && only != current {
            return false;
        }
        if state.exited {
            drop(state);
            routes.remove(&id);
        } else {
            state.route = Route::Closed;
        }
        true
    }

    fn send(&self, id: SessionId, event: TermEvent) {
        let exit = matches!(event, TermEvent::Exit { .. });
        let entry = self.route(id);
        let mut state = entry.lock();
        state.exited |= exit;
        match &mut state.route {
            Route::Attached(channel) => {
                let _ = channel.send(event);
            }
            Route::Buffered(events) => events.push(event),
            Route::Closed if exit => {
                drop(state);
                self.forget_closed(id);
            }
            Route::Closed => {}
        }
    }

    /// Removes a closed route, unless a view re-attached to it meanwhile.
    fn forget_closed(&self, id: SessionId) {
        let mut routes = self.routes.lock();
        if routes
            .get(&id)
            .is_some_and(|entry| matches!(entry.lock().route, Route::Closed))
        {
            routes.remove(&id);
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

#[cfg(test)]
#[path = "sink_tests.rs"]
mod tests;
