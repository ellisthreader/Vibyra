use super::manager::PtyManager;
use super::remote::RemoteSince;
use super::SessionId;
use crate::error::CoreResult;

/// What a phone watching this Mac may read of a session: its own bounded tail,
/// which the desktop's output does not consume. The grid is the Mac's alone;
/// a phone draws it at whatever zoom suits its screen.
impl PtyManager {
    pub fn remote_snapshot(&self, id: SessionId) -> CoreResult<(String, u64, bool)> {
        Ok(self.session_ref(id)?.output.lock().remote.snapshot())
    }

    /// Where the session's remote stream has reached, without copying any of it.
    pub fn remote_offset(&self, id: SessionId) -> CoreResult<u64> {
        Ok(self.session_ref(id)?.output.lock().remote.offset())
    }

    /// Only what a reader at `from` has not had. A live stream polls every
    /// terminal several times a second, and copying and decoding each one's
    /// whole replay window to find usually nothing new was most of its cost.
    pub fn remote_since(&self, id: SessionId, from: u64) -> CoreResult<RemoteSince> {
        Ok(self.session_ref(id)?.output.lock().remote.since(from))
    }
}
