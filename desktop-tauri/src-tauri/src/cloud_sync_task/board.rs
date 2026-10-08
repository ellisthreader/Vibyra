//! The worker's live view of itself, shared with the status command. Anything
//! durable (what was uploaded, held-back files, the last error) lives in the
//! engine's own per-project state on disk; this is only what is true right now.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use parking_lot::Mutex;

/// Why nothing is being synced, when nothing is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Gate {
    #[default]
    Starting,
    SignedOut,
    Off,
    NeedsConsent,
    /// The account has no cloud computer to sync to (feature off or plan).
    Unavailable,
    Ready,
}

impl Gate {
    pub fn as_str(self) -> &'static str {
        match self {
            Gate::Starting => "starting",
            Gate::SignedOut => "signedOut",
            Gate::Off => "off",
            Gate::NeedsConsent => "needsConsent",
            Gate::Unavailable => "unavailable",
            Gate::Ready => "ready",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ProjectLive {
    pub running: bool,
    /// The cloud computer has not published its key yet.
    pub waiting: bool,
    /// Unix seconds of the next retry after a failure.
    pub retry_at: Option<u64>,
    pub error: Option<String>,
}

/// The Codex login carry-over as it is right now (the durable part is the engine's own record).
#[derive(Debug, Clone, Default)]
pub struct LoginLive {
    pub running: bool,
    pub sent_at: Option<u64>,
    /// There is no Codex login file on this Mac.
    pub not_signed_in: bool,
    /// The cloud computer has not published its key yet.
    pub waiting: bool,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
pub struct BoardData {
    pub gate: Gate,
    /// Offline, refused, or the cloud computer cannot be reached: one line for the whole feature.
    pub message: Option<String>,
    pub last_poll_at: Option<u64>,
    pub projects: HashMap<String, ProjectLive>,
    pub login: LoginLive,
    /// Never agreed on this Mac, but the account agreed on the phone ("Connect to cloud").
    pub consent_from_phone: bool,
    /// The phone consent was looked up (or the Mac agreed itself): until then the dialog waits.
    pub consent_checked: bool,
    /// Not ticked for Vibyra Cloud ("Only on this Mac"). With `ticked_by_account` it covers every project.
    pub not_chosen: HashSet<String>,
    /// The account's ticks are the selection (the server speaks the access contract), not this Mac's switch.
    pub ticked_by_account: bool,
    /// What the account last said about the "Connect to cloud" agreement (`None` = not asked yet this session).
    pub account_consent: Option<bool>,
    /// The iPhone turned the Codex login carry-over off.
    pub codex_blocked: bool,
}

pub type Board = Arc<Mutex<BoardData>>;

pub fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}
