use crate::{identifier, text};
use rusqlite::{params, Connection};
use serde_json::Value;

/// Durable model/source receipt, still scoped to the paired device and wallet account.
pub(crate) fn prepare(
    db: &Connection,
    device: &str,
    project: &str,
    method: &str,
    p: &Value,
) -> Result<(), String> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS funded_bindings (
            chat TEXT PRIMARY KEY, account TEXT NOT NULL, device TEXT NOT NULL,
            project TEXT NOT NULL, model TEXT NOT NULL, tools INTEGER NOT NULL)",
    )
    .map_err(|e| e.to_string())?;
    if method == "vibes.bind" && p["source"] == "vibyra" {
        let chat = text(p, "chatId")?;
        let account = text(p, "accountToken")?;
        identifier(chat)?;
        identifier(account)?;
        let model = text(p, "model")?;
        if model.is_empty() || model.len() > 200 || model.chars().any(char::is_control) {
            return Err("Choose a valid model".into());
        }
        let tools = p["tools"].as_bool().ok_or("Missing model capabilities")?;
        db.execute(
            "INSERT OR IGNORE INTO funded_bindings VALUES (?1,?2,?3,?4,?5,?6)",
            params![chat, account, device, project, model, tools],
        )
        .map_err(|e| e.to_string())?;
        let same: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM funded_bindings WHERE
                chat=?1 AND account=?2 AND device=?3 AND project=?4 AND model=?5 AND tools=?6)",
                params![chat, account, device, project, model, tools],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !same {
            return Err("This terminal launch belongs to another model, account or project".into());
        }
    }
    Ok(())
}
