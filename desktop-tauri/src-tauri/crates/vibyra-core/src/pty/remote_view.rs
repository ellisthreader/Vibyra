use super::manager::PtyManager;
use super::SessionId;
use crate::error::CoreResult;

/// What a phone watching this Mac may read of a session: its own bounded tail,
/// which the desktop's output does not consume. The grid is the Mac's alone;
/// a phone draws it at whatever zoom suits its screen.
impl PtyManager {
    pub fn remote_snapshot(&self, id: SessionId) -> CoreResult<(String, u64, bool)> {
        Ok(self.session_ref(id)?.output.lock().remote.snapshot())
    }
}
