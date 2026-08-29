//! Finding a chat by what was said in it.
//!
//! Searches the event payloads directly rather than maintaining a second
//! index. The transcript is the only copy of what was said, and a `LIKE` over
//! a few hundred thousand bounded rows is well inside the budget of a search
//! box — an index would be a second thing to keep correct for no user-visible
//! gain at this size.

use rusqlite::params;

use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::record::{AgentChat, COLUMNS};

/// Finds chats by title or by anything said in them.
///
/// Searches the event payloads directly rather than keeping a second index:
/// the transcript is the only copy of what was said, and a `LIKE` over a few
/// hundred thousand bounded rows is well inside the budget of a search box.
pub fn search(db: &AgentDb, account: &str, query: &str) -> CoreResult<Vec<AgentChat>> {
    // Wildcards are stripped rather than escaped: a lone `%` typed into a
    // search box means the character, and letting it through would match every
    // chat on the account.
    let cleaned = query.trim().replace(['%', '_'], "");
    if cleaned.chars().count() < 3 {
        return Ok(Vec::new());
    }
    let needle = format!("%{cleaned}%");
    db.with(|connection| {
        let sql_text = format!(
            "SELECT {COLUMNS} FROM agent_chats c WHERE c.account = ?1 AND c.archived_ms IS NULL \
             AND (c.title LIKE ?2 OR EXISTS ( \
                SELECT 1 FROM chat_events e WHERE e.chat_id = c.id AND e.payload LIKE ?2 \
             )) ORDER BY c.updated_ms DESC LIMIT 50"
        );
        let mut statement = connection.prepare(&sql_text).map_err(sql)?;
        let rows = statement
            .query_map(params![account, needle], |row| Ok(AgentChat::from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}
