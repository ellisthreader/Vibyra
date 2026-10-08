//! Cloud sync in the background: keeps every project the user has open ready on the
//! account's cloud computer (`vibyra-sync` does the snapshots, encryption and uploads)
//! and brings back what the cloud computer changed for review.
//!
//! Nothing runs until the user is signed in, the account has a cloud computer, the
//! one-time consent was given and the switch is on. Work happens on one background
//! thread, one upload at a time, and never on the UI thread or the async runtime.
//!
//! * `schedule` decides when (debounce, sweep, poll, backoff), `worker` gates and acts,
//!   `runner` is the thread, `watch` the file watchers, `real` the glue to the app.
//! * Triggers: file changes (15 s of quiet), a 2-minute sweep, window focus loss, quit,
//!   wake from sleep (detected by a wall-clock gap), and "Sync now".
//! * Not feasible without extra native code: a final flush right before macOS sleeps.
//!   The 15 s debounce and focus-loss flush bound what a lid close can leave behind.

mod board;
mod login_track;
mod port;
mod real;
mod runner;
mod schedule;
mod schedule_end;
mod schedule_types;
pub mod settings_io;
mod slot;
mod tracked;
mod view;
mod view_login;
mod watch;
mod worker;
mod worker_access;
mod worker_login;
mod worker_msg;
mod worker_phone;
mod worker_prune;
mod worker_run;

#[cfg(test)]
mod schedule_tests;
#[cfg(test)]
mod worker_fake;
#[cfg(test)]
mod worker_rig;
#[cfg(test)]
mod worker_tests;
#[cfg(test)]
mod worker_tests_access;
#[cfg(test)]
mod worker_tests_cloud;
#[cfg(test)]
mod worker_tests_login;
#[cfg(test)]
mod worker_tests_phone;

use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, Window, WindowEvent};

use crate::close_guard;

pub use board::Board;
pub use real::{backup_dir, resolved};
pub use slot::EngineSlot;
pub use tracked::Tracked;
pub use view::{build as build_status, SyncStatusView};
pub use worker::Msg;

/// How long quitting waits for a final upload before it gives up and exits.
const QUIT_FLUSH: Duration = Duration::from_secs(8);

pub struct Handle {
    tx: Sender<Msg>,
    pub board: Board,
    pub slot: Arc<EngineSlot>,
}

impl Handle {
    pub fn send(&self, msg: Msg) {
        let _ = self.tx.send(msg);
    }

    /// Settings, consent or sign-in changed: look again now.
    pub fn reconfigure(&self) {
        self.send(Msg::Reconfigure);
    }

    /// Uploads whatever is waiting and returns when it is done or `limit` has passed.
    pub fn flush_and_wait(&self, limit: Duration) -> bool {
        let (ack, done) = channel();
        self.send(Msg::FlushAndAck(ack));
        done.recv_timeout(limit).is_ok()
    }
}

pub fn spawn(app: AppHandle) {
    let state = app.state::<crate::state::AppState>();
    let dir = slot::state_dir(&state.settings_path);
    let slot = Arc::new(EngineSlot::new(dir.clone()));
    let board = Board::default();
    let (tx, rx) = channel();
    app.manage(Handle {
        tx: tx.clone(),
        board: Arc::clone(&board),
        slot: Arc::clone(&slot),
    });
    let started = std::time::Instant::now();
    let worker = worker::Worker::new(
        real::RealPort {
            app: app.clone(),
            slot,
            tracked: tracked::Tracked::new(&dir),
        },
        real::AppEnv { app },
        board,
        Box::new(move || started.elapsed().as_millis() as u64 + 1),
    );
    let spawned = std::thread::Builder::new()
        .name("cloud-sync".into())
        .spawn(move || runner::run(worker, rx, tx));
    if let Err(error) = spawned {
        eprintln!("Vibyra could not start background cloud sync: {error}");
    }
}

/// The window handler: losing focus uploads anything still waiting out its quiet period, then the
/// close guard decides about closing as before.
pub fn window_event(window: &Window, event: &WindowEvent) {
    close_guard::window_event(window, event);
    if matches!(event, WindowEvent::Focused(false)) {
        if let Some(handle) = window.try_state::<Handle>() {
            handle.send(Msg::FlushDirty);
        }
    }
}

/// The run-loop handler: on the way out, give a pending upload a few seconds to finish, then the close
/// guard shuts the rest down as before.
pub fn run_event(app: &AppHandle, event: RunEvent) {
    if matches!(event, RunEvent::Exit) {
        if let Some(handle) = app.try_state::<Handle>() {
            handle.flush_and_wait(QUIT_FLUSH);
            handle.send(Msg::Shutdown);
        }
    }
    close_guard::run_event(app, event);
}
