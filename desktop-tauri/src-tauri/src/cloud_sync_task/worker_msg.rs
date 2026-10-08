//! What can be said to the worker from outside: file changes, focus loss, quitting, "Sync now", waking.

use std::sync::mpsc::Sender;

use super::port::{Env, Port};
use super::worker::Worker;

pub enum Msg {
    Changed(String),
    FlushDirty,
    /// Flush, and answer once nothing more is due (used when the app quits).
    FlushAndAck(Sender<()>),
    SyncNow(Option<String>),
    Wake,
    Reconfigure,
    /// Stop the thread (the app is quitting).
    Shutdown,
}

impl<P: Port, E: Env> Worker<P, E> {
    pub fn handle(&mut self, msg: Msg) {
        let now = (self.clock)();
        match msg {
            Msg::Changed(id) => self.sched.changed(&id, now),
            Msg::FlushDirty => self.sched.flush_dirty(now),
            Msg::FlushAndAck(tx) => {
                self.sched.flush_dirty(now);
                self.ack = Some(tx);
            }
            Msg::SyncNow(id) => {
                (self.cloud, self.phone_at) = (None, None);
                self.sched.sync_now(id.as_deref(), now);
                self.login.explicit(now);
            }
            Msg::Wake => {
                (self.cloud, self.phone_at) = (None, None);
                self.sched.wake(now);
                self.login.explicit(now);
            }
            Msg::Reconfigure => {
                // A pause lifted, an agreement or a tick made here: read the account again now.
                (self.cloud, self.phone_at) = (None, None);
                self.sched.resume();
                self.login.next_at = now;
            }
            Msg::Shutdown => {}
        }
    }
}
