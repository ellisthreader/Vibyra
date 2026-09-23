//! Flow control between a session's output and the view parsing it.
//!
//! The flusher delivers whatever arrived each tick. A flood (`yes`, `cat` of a
//! large log) arrives far faster than a terminal view parses it, and a view
//! that queues it all grows without bound until it starts discarding writes.
//! So the view says when it is behind, and output waits here until it has
//! caught up; waiting overflows into a single bounded resync.

use super::manager::PtyManager;
use super::SessionId;
use crate::error::CoreResult;

impl PtyManager {
    /// Holds `id`'s output while its view is behind, or releases it. A hold
    /// lapses by itself after a few seconds unless renewed.
    pub fn hold_output(&self, id: SessionId, hold: bool) -> CoreResult<()> {
        self.session_ref(id)?.output.lock().hold(hold);
        if !hold {
            // What waited is delivered now, not at the next unrelated wake.
            let _ = self.flush_tx.try_send(());
        }
        Ok(())
    }
}
