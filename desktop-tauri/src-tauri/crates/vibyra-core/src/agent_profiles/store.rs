//! Reads and writes of the roster. The only file that spells out its SQL.

use rusqlite::params;

use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::clean_name;
use super::record::{AgentProfile, AgentUpdate, COLUMNS};

/// Every live teammate on this account, most recently touched first.
pub fn list(db: &AgentDb, account: &str) -> CoreResult<Vec<AgentProfile>> {
    db.with(|connection| {
        let query = format!(
            "SELECT {COLUMNS} FROM agent_profiles \
             WHERE account = ?1 AND archived_ms IS NULL ORDER BY updated_ms DESC"
        );
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![account], |row| Ok(AgentProfile::from_row(row)))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

/// One teammate by id, scoped to the account that asked.
pub fn get(db: &AgentDb, account: &str, id: &str) -> CoreResult<AgentProfile> {
    db.with(|connection| get_in(connection, account, id))
}

fn get_in(connection: &rusqlite::Connection, account: &str, id: &str) -> CoreResult<AgentProfile> {
    let query = format!("SELECT {COLUMNS} FROM agent_profiles WHERE id = ?1 AND account = ?2");
    connection
        .query_row(&query, params![id, account], |row| {
            Ok(AgentProfile::from_row(row))
        })
        .map_err(|_| CoreError::Settings(format!("no agent {id} on this account")))?
}

/// Applies a partial change. Read-modify-write inside one transaction so two
/// settings rows saved at once cannot lose each other's field.
pub fn update(
    db: &AgentDb,
    account: &str,
    id: &str,
    change: AgentUpdate,
) -> CoreResult<AgentProfile> {
    db.transact(|connection| {
        let mut profile = get_in(connection, account, id)?;
        let renamed = change.name.clone();
        change.apply(&mut profile);
        if let Some(name) = renamed {
            profile.name = clean_name(&name)?;
        }
        profile.updated_ms = now_ms();
        connection
            .execute(
                "UPDATE agent_profiles SET name = ?1, brief = ?2, model = ?3, effort = ?4, \
                 permission = ?5, memory_budget = ?6, reflection = ?7, accent = ?8, \
                 mail_enabled = ?9, routines_allowed = ?10, updated_ms = ?11 \
                 WHERE id = ?12 AND account = ?13",
                params![
                    profile.name,
                    profile.brief,
                    profile.model,
                    profile.effort,
                    profile.permission.as_str(),
                    profile.memory_budget,
                    profile.reflection.as_str(),
                    profile.accent,
                    profile.mail_enabled as i64,
                    profile.routines_allowed as i64,
                    profile.updated_ms,
                    id,
                    account,
                ],
            )
            .map_err(sql)?;
        Ok(profile)
    })
}

/// Hides a teammate without destroying its chats. The reversible half of
/// deletion, and what the UI offers first.
pub fn archive(db: &AgentDb, account: &str, id: &str, archived: bool) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_profiles SET archived_ms = ?1, updated_ms = ?2 \
                 WHERE id = ?3 AND account = ?4",
                params![archived.then(now_ms), now_ms(), id, account],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Removes a teammate and everything that cascades from it. The approval
/// ledger and mail trail survive by design; see the schema.
pub fn delete(db: &AgentDb, account: &str, id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "DELETE FROM agent_profiles WHERE id = ?1 AND account = ?2",
                params![id, account],
            )
            .map_err(sql)?;
        Ok(())
    })
}
