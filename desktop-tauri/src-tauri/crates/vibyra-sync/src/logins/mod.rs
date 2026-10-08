//! Opt-in carry-over of a Codex login to the cloud computer (contract: "Logins").
//!
//! Only `$CODEX_HOME/auth.json` is ever read, and only when the caller asks (the user switched the feature on or
//! ran `vibyra-sync send-login codex`). The contents are never logged, printed, put in an error or written to
//! any file other than the sealed upload; the state keeps only a SHA-256, times and the seq.
mod pack;
mod source;
mod state;

pub use pack::{pack_codex, pack_entry, unpack_codex, CLAUDE_ENTRY, CODEX_ENTRY};
pub use source::{CodexSource, MAX_LOGIN_BYTES};
pub use state::{LoginStatus, LoginStore, ProviderState};

/// A changed login is re-sent at most this often (refresh tokens rotate, so the file changes while Codex runs).
pub const RESEND_MIN_SECS: u64 = 600;

#[derive(Debug, Clone, PartialEq)]
pub enum LoginOutcome {
    /// The sealed login went up as `seq`.
    Sent { seq: u64, bytes: u64 },
    /// The file has not changed since the last send (and the cloud still has it).
    Unchanged,
    /// The file changed, but the last send was too recent; try again after this many seconds.
    Throttled { retry_in_secs: u64 },
    /// There is no Codex login file on this Mac.
    NotSignedIn,
    /// The cloud computer has not published its key yet.
    WaitingForCloud,
}
