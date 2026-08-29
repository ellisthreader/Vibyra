//! Identifiers and clock, in one place so every table agrees on both.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the epoch — the timestamp shape the rest of Vibyra
/// already persists (`lastOpenedMs`, `modifiedMs`) and the one the frontend
/// can hand straight to `Date`.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as i64)
        .unwrap_or(0)
}

/// A new row id.
///
/// UUIDv7 rather than v4: the first 48 bits are the timestamp, so ids sort in
/// creation order. That makes an index on `(agent_id, id)` useful as a
/// chronological cursor and keeps B-tree inserts at the right-hand edge
/// instead of scattering them across the page range.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

/// A conversation id for a provider CLI.
///
/// Deliberately v4, not v7. This one is handed to `claude --session-id`, which
/// takes a plain UUID and is under no obligation to keep accepting a version
/// it has never been asked for. v4 is the shape every provider already mints
/// for itself.
pub fn new_session_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
