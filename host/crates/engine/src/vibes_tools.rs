use crate::{identifier, text, Engine};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

impl Engine {
    pub(crate) fn vibes_tool(
        &self,
        device: &str,
        method: &str,
        p: &Value,
    ) -> Result<Value, String> {
        let project = self.project(p)?;
        let state = self.shared.lock();
        let db = &state.journal.connection;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS vibes_bindings (
            token TEXT PRIMARY KEY, device TEXT NOT NULL, account TEXT NOT NULL,
            chat TEXT NOT NULL, project TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS vibes_tools (
            id TEXT PRIMARY KEY, binding TEXT NOT NULL, digest TEXT NOT NULL, result TEXT);",
        )
        .map_err(|e| e.to_string())?;
        if method == "vibes.bind" {
            let account = text(p, "accountToken")?;
            identifier(account)?;
            let chat = text(p, "chatId")?;
            identifier(chat)?;
            let token = uuid::Uuid::new_v4().to_string();
            db.execute(
                "INSERT INTO vibes_bindings VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    token,
                    device,
                    account,
                    chat,
                    project.id,
                    chrono::Utc::now().timestamp() + 86400
                ],
            )
            .map_err(|e| e.to_string())?;
            return Ok(json!({"binding":token,"projectId":project.id,"chatId":chat}));
        }
        let binding = text(p, "binding")?;
        let valid: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM vibes_bindings
            WHERE token=?1 AND device=?2 AND project=?3 AND chat=?4 AND account=?5 AND expires>?6)",
                params![
                    binding,
                    device,
                    project.id,
                    text(p, "chatId")?,
                    text(p, "accountToken")?,
                    chrono::Utc::now().timestamp()
                ],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !valid {
            return Err(
                "Project access expired or belongs to another account, chat or device".into(),
            );
        }
        let id = text(p, "toolId")?;
        identifier(id)?;
        let digest = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(p).map_err(|e| e.to_string())?)
        );
        let prior: Option<(String, String, Option<String>)> = db
            .query_row(
                "SELECT binding,digest,result FROM vibes_tools WHERE id=?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((owner, previous, result)) = prior {
            if owner != binding || previous != digest {
                return Err("Tool request was changed or belongs to another binding".into());
            }
            return result.map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
                .unwrap_or_else(|| Err("Tool delivery is uncertain. Inspect the file before a new action; this action will not repeat".into()));
        }
        let deadline = p["expiresAt"].as_i64().ok_or("Missing tool expiry")?;
        let now = chrono::Utc::now().timestamp();
        if deadline <= now || deadline > now + 900 {
            return Err("This tool request has expired. Request a new action in the chat".into());
        }
        db.execute(
            "INSERT INTO vibes_tools(id,binding,digest) VALUES(?1,?2,?3)",
            params![id, binding, digest],
        )
        .map_err(|e| e.to_string())?;
        let decision = text(p, "decision")?;
        let operation = text(p, "operation")?;
        // Every remote tool has an explicit mobile decision bound into the durable receipt.
        let result = if decision == "decline" {
            Ok(json!({"declined":true}))
        } else if decision != "allow" {
            Err("An explicit tool decision is required".into())
        } else {
            let path = text(p, "path")?;
            if path.split('/').any(|s| {
                s == ".git" || s == ".env" || s.starts_with(".env.") || s == "node_modules"
            }) {
                Err("This path is not available to the AI project tools".into())
            } else if std::path::Path::new(path)
                .components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
            {
                Err("Use a path inside the authorized project".into())
            } else if std::path::Path::new(path)
                .ancestors()
                .filter(|p| !p.as_os_str().is_empty())
                .any(|p| {
                    project
                        .directory
                        .symlink_metadata(p)
                        .map(|m| m.is_symlink())
                        .unwrap_or(false)
                })
            {
                Err("AI project tools cannot follow symbolic links".into())
            } else {
                drop(state);
                let result = match operation {
                    "list_files" => self.files(p).map(|mut value| {
                        if let Some(entries) = value["entries"].as_array_mut() {
                            entries.retain(|e| e["name"].as_str().is_some_and(|n| n != ".git" && n != "node_modules" && n != ".env" && !n.starts_with(".env.")));
                            entries.truncate(50);
                            while serde_json::to_vec(entries).map(|v| v.len()).unwrap_or(0) > 12000 { entries.pop(); }
                        }
                        value
                    }),
                    "read_file" => self.read(p).map(|mut value| {
                        if let Some(content) = value["content"].as_str().map(str::to_owned) {
                            if content.len() > 8192 || serde_json::to_vec(&value).map(|v| v.len()).unwrap_or(0) > 15000 {
                                return json!({"error":"This file is too large for the AI tool. Choose a smaller file (8 KB maximum)."});
                            }
                            value["sha256"] =
                                json!(format!("{:x}", Sha256::digest(content.as_bytes())));
                        }
                        value
                    }),
                    "write_file" => crate::vibes_write::write(&project, p),
                    _ => Err("This AI tool is unavailable".into()),
                };
                let state = self.shared.lock();
                return save(&state.journal.connection, id, result);
            }
        };
        save(db, id, result)
    }
}

fn save(
    db: &rusqlite::Connection,
    id: &str,
    result: Result<Value, String>,
) -> Result<Value, String> {
    let value = match result {
        Ok(value) => value,
        Err(error) => json!({"error":error}),
    };
    db.execute(
        "UPDATE vibes_tools SET result=?1 WHERE id=?2",
        params![value.to_string(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(value)
}
