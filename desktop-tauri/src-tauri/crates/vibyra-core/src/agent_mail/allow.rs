//! Who each agent may write to.
//!
//! Separate from `mail_enabled` on the profile, and the difference matters:
//! enabling messaging says an agent may be *spoken to*; a row here says who
//! may speak to whom. An agent with messaging on and an empty list is
//! reachable by nobody, which is the right default for a feature that can
//! spend money unattended.

use rusqlite::params;

use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

/// Sets who an agent may write to. Replaces the list wholesale, so removing a
/// teammate is one call rather than a diff the caller has to compute.
pub fn set_allowlist(db: &AgentDb, agent_id: &str, peers: &[String]) -> CoreResult<()> {
    db.transact(|connection| {
        connection
            .execute(
                "DELETE FROM agent_mail_allow WHERE agent_id = ?1",
                params![agent_id],
            )
            .map_err(sql)?;
        for peer in peers {
            connection
                .execute(
                    "INSERT OR IGNORE INTO agent_mail_allow (agent_id, peer_id) VALUES (?1, ?2)",
                    params![agent_id, peer],
                )
                .map_err(sql)?;
        }
        Ok(())
    })
}

pub fn allowlist(db: &AgentDb, agent_id: &str) -> CoreResult<Vec<String>> {
    db.with(|connection| {
        let mut statement = connection
            .prepare("SELECT peer_id FROM agent_mail_allow WHERE agent_id = ?1")
            .map_err(sql)?;
        let rows = statement
            .query_map(params![agent_id], |row| row.get::<_, String>(0))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}
