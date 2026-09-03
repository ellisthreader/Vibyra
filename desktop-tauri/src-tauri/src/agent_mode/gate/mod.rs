//! The app's end of the permission bridge.
//!
//! One local listener for the life of the process, bound to a port nobody
//! chose and guarded by a token nobody but a turn Vibyra started has seen.
//! Every Claude turn is told where it is; every question that arrives is
//! judged by the same broker that judges a handoff, and a card that has to be
//! raised blocks the provider until the person answers.
//!
//! Started eagerly at setup rather than on the first turn: binding a loopback
//! port costs nothing, and a turn must never wait on the gate coming up.

mod context;
mod decide;
#[cfg(test)]
mod decide_tests;
mod listener;
pub mod waiters;

use std::sync::{Arc, OnceLock};

use tauri::AppHandle;
use vibyra_core::agent_runtime::PermissionBridge;

use super::hub::AgentHub;

/// Where the gate listens, once it does.
pub struct GateInfo {
    pub port: u16,
    pub token: String,
}

static GATE: OnceLock<GateInfo> = OnceLock::new();

/// Binds the listener and starts answering. Failing to bind is logged, not
/// fatal: turns then run without a bridge, exactly as they did before.
pub fn start(app: AppHandle, hub: Arc<AgentHub>) {
    let listener = match std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Vibyra permission gate did not start: {error}");
            return;
        }
    };
    let Ok(address) = listener.local_addr() else {
        return;
    };
    let token = format!(
        "{}{}",
        vibyra_core::agentdb::ids::new_id(),
        vibyra_core::agentdb::ids::new_id()
    );
    if GATE
        .set(GateInfo {
            port: address.port(),
            token: token.clone(),
        })
        .is_err()
    {
        return;
    }
    listener::spawn(app, hub, listener, token);
}

/// The bridge a turn should hand to Claude, or `None` while the gate is down.
///
/// Inside an AppImage the executable to run is the image itself, not the
/// binary mounted under it: the image's launcher is what sets up the bundled
/// libraries the binary loads, and the bridge mode exits before any of them
/// matter — but the loader does not know that.
pub fn bridge_for(chat_id: &str, turn_id: &str) -> Option<PermissionBridge> {
    let gate = GATE.get()?;
    let exe = std::env::var_os("APPIMAGE")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| std::env::current_exe().ok())?;
    Some(PermissionBridge {
        exe,
        port: gate.port,
        token: gate.token.clone(),
        chat_id: chat_id.to_string(),
        turn_id: turn_id.to_string(),
    })
}
