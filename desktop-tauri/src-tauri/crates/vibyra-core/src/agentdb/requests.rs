//! Receipts commit with their writes, so retrying a lost reply cannot repeat it.
use super::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};

pub const SCHEMA: &str = "CREATE TABLE agent_write_receipts (
 account TEXT NOT NULL, scope TEXT NOT NULL, operation TEXT NOT NULL, token TEXT NOT NULL,
 fingerprint TEXT NOT NULL, entity_id TEXT NOT NULL,
 PRIMARY KEY(account, token));
 CREATE INDEX agent_write_receipt_token ON agent_write_receipts(account, token);";

pub fn stable_id(scope: &str, token: Option<&str>) -> CoreResult<String> {
    let Some(token) = token else {
        return Ok(super::ids::new_id());
    };
    validate(token)?;
    let digest = Sha256::digest(format!("agent-home:{scope}:{token}"));
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Ok(uuid::Uuid::from_bytes(bytes).to_string())
}

fn validate(token: &str) -> CoreResult<()> {
    crate::agent_chats::managed_paths::validate_id(token)
}

pub fn once<T: Serialize + DeserializeOwned, P: Serialize>(
    db: &AgentDb,
    scope: &str,
    operation: &str,
    token: Option<&str>,
    payload: &P,
    write: impl FnOnce(&Connection) -> CoreResult<T>,
) -> CoreResult<T> {
    let Some(token) = token else {
        return db.transact(write);
    };
    validate(token)?;
    let encoded = serde_json::to_vec(&(operation, scope, payload)).map_err(json_error)?;
    let fingerprint = format!("{:x}", Sha256::digest(encoded));
    db.transact(|connection| {
        let account = owner(connection, operation, scope)?;
        let prior: Option<(String, String)> = connection.query_row(
            "SELECT fingerprint, entity_id FROM agent_write_receipts
             WHERE account=?1 AND token=?2",
            params![account, token], |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional().map_err(sql)?;
        if let Some((found, result)) = prior {
            if found != fingerprint {
                return Err(CoreError::Settings("SAVE_CONFLICT: This save was already submitted with different content. Reopen the saved item before changing it.".into()));
            }
            let current = super::receipt_read::current(connection, operation, &result)?
                .ok_or_else(|| CoreError::Settings("The earlier save completed, but the item has since been deleted.".into()))?;
            return serde_json::from_value(current).map_err(json_error);
        }
        let result = write(connection)?;
        let value = serde_json::to_value(&result).map_err(json_error)?;
        let id = value.get("id").and_then(|id| id.as_str())
            .ok_or_else(|| CoreError::Settings("Saved item has no identifier".into()))?;
        connection.execute(
            "INSERT INTO agent_write_receipts (account, scope, operation, token, fingerprint, entity_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![account, scope, operation, token, fingerprint, id],
        ).map_err(sql)?;
        Ok(result)
    })
}

fn json_error(error: serde_json::Error) -> CoreError {
    CoreError::Settings(format!("Could not record the save outcome: {error}"))
}

pub fn receipt(db: &AgentDb, account: &str, token: &str) -> CoreResult<Option<serde_json::Value>> {
    validate(token)?;
    db.with(|connection| {
        let prior: Option<(String, String)> = connection.query_row(
            "SELECT operation, entity_id FROM agent_write_receipts WHERE token=?1 AND account=?2", [token, account],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional().map_err(sql)?;
        prior.map(|(operation, result)| {
            let result = super::receipt_read::current(connection, &operation, &result)?;
            Ok(serde_json::json!({ "operation": operation, "deleted": result.is_none(), "result": result }))
        }).transpose()
    })
}

fn owner(connection: &Connection, operation: &str, scope: &str) -> CoreResult<String> {
    if matches!(operation, "agent.create" | "skill.install" | "skill.revise") {
        return Ok(scope.to_string());
    }
    connection
        .query_row(
            "SELECT account FROM agent_profiles WHERE id=?1",
            [scope],
            |row| row.get(0),
        )
        .map_err(sql)
}
