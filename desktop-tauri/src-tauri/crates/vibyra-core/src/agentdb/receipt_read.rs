//! Receipts retain IDs, not deleted memory/brief/skill text. Read current rows.
use super::sql;
use crate::error::{CoreError, CoreResult};
use crate::{agent_memory, agent_profiles, routines, skills};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

pub(super) fn current(
    connection: &Connection,
    operation: &str,
    id: &str,
) -> CoreResult<Option<Value>> {
    match operation {
        "agent.create" => read(
            connection,
            "agent_profiles",
            agent_profiles::RECEIPT_COLUMNS,
            id,
            agent_profiles::AgentProfile::from_row,
        ),
        "memory.add" => read(
            connection,
            "memory_entries",
            agent_memory::RECEIPT_COLUMNS,
            id,
            agent_memory::MemoryEntry::from_row,
        ),
        "skill.install" | "skill.revise" => read(
            connection,
            "skills",
            skills::RECEIPT_COLUMNS,
            id,
            skills::Skill::from_row,
        ),
        "routine.create" | "routine.update" => read(
            connection,
            "routines",
            routines::RECEIPT_COLUMNS,
            id,
            routines::receipt_row,
        ),
        _ => Err(CoreError::Settings("Unknown save operation".into())),
    }
}
fn read<T: Serialize>(
    connection: &Connection,
    table: &str,
    columns: &str,
    id: &str,
    row: fn(&rusqlite::Row<'_>) -> CoreResult<T>,
) -> CoreResult<Option<Value>> {
    // Table/column identifiers above are compile-time constants.
    let found = connection
        .query_row(
            &format!("SELECT {columns} FROM {table} WHERE id=?1"),
            [id],
            |r| Ok(row(r)),
        )
        .optional()
        .map_err(sql)?;
    found
        .map(|record| serde_json::to_value(record?).map_err(|e| CoreError::Settings(e.to_string())))
        .transpose()
}
