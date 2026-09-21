use super::model::bounded;
use crate::journal::Journal;
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const LIMIT: usize = 256 * 1024;
impl Journal {
    pub(super) fn conversation_detail(&self, session: &str, item: &Value) -> Option<String> {
        let data: String = self
            .connection
            .query_row(
                "SELECT data FROM conversation_items WHERE session=?1 AND id=?2",
                params![session, item.as_str()?],
                |row| row.get(0),
            )
            .ok()?;
        let data: Value = serde_json::from_str(&data).ok()?;
        if data["truncated"] == true {
            return None;
        }
        self.connection
            .query_row(
                "SELECT content FROM conversation_artifacts WHERE session=?1 AND id=?2",
                params![session, data["artifact"]["id"].as_str()?],
                |row| row.get(0),
            )
            .ok()
    }

    pub(super) fn original_position(&self, session: &str, item: &mut Value) -> Result<(), String> {
        let old: Option<String> = self
            .connection
            .query_row(
                "SELECT data FROM conversation_items WHERE session=?1 AND id=?2",
                params![session, item["id"].as_str()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(old) = old {
            let old: Value = serde_json::from_str(&old).map_err(|e| e.to_string())?;
            item["order"] = old["order"].clone();
            item["startedAt"] = old["startedAt"].clone();
        }
        Ok(())
    }

    pub(super) fn prepare_artifact(&self, session: &str, item: &mut Value) -> Result<(), String> {
        if !matches!(
            item["kind"].as_str(),
            Some("message" | "activity" | "permission")
        ) {
            return Ok(());
        }
        let field = if item["kind"] == "message" {
            "text"
        } else {
            "detail"
        };
        let id = format!("{:x}", Sha256::digest(format!("{}:{field}", item["id"])));
        let mut content = item[field].as_str().unwrap_or("").to_owned();
        if let Some(delta) = item.get("_delta").and_then(Value::as_str) {
            let previous: Option<String> = self
                .connection
                .query_row(
                    "SELECT content FROM conversation_artifacts WHERE session=?1 AND id=?2",
                    params![session, id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(previous) = previous {
                content = format!("{previous}{delta}");
            }
        }
        item.as_object_mut().unwrap().remove("_delta");
        if content.is_empty() {
            return Ok(());
        }
        if item["kind"] == "permission" && content.len() > LIMIT {
            return Err("Approval details exceed the retained artifact limit".into());
        }
        let truncated = content.len() > LIMIT || item["truncated"] == true;
        let content = bounded(&content, LIMIT);
        let bytes: i64 = self.connection.query_row(
            "SELECT COALESCE(SUM(length(CAST(content AS BLOB))),0) FROM conversation_artifacts WHERE session=?1 AND id<>?2",
            params![session,id], |r| r.get(0)).map_err(|e| e.to_string())?;
        if bytes + content.len() as i64 > 64 * 1024 * 1024 {
            return Err("Conversation reached its 64 MB retained-output limit. Export history and start a new chat.".into());
        }
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        self.connection
            .execute(
                "INSERT INTO conversation_artifacts(session,id,content,hash) VALUES(?1,?2,?3,?4)
            ON CONFLICT(session,id) DO UPDATE SET content=excluded.content,hash=excluded.hash",
                params![session, id, content, hash],
            )
            .map_err(|e| e.to_string())?;
        item["artifact"] = json!({"id":id,"hash":hash,"bytes":content.len(),"truncated":truncated});
        item[field] = json!(bounded(&content, 6000));
        item["truncated"] = json!(truncated);
        item["hasDetail"] = json!(content.len() > 6000);
        // Patches are retained in the artifact, never duplicated into every event frame.
        if item["category"] == "fileChange" {
            if let Some(changes) = item["changes"].as_array_mut() {
                for change in changes {
                    let diff = change["diff"].as_str().unwrap_or("");
                    let added = diff
                        .lines()
                        .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
                        .count();
                    let removed = diff
                        .lines()
                        .filter(|l| l.starts_with('-') && !l.starts_with("---"))
                        .count();
                    change["added"] = json!(added);
                    change["removed"] = json!(removed);
                    change.as_object_mut().unwrap().remove("diff");
                }
            }
        }
        Ok(())
    }
    pub(super) fn artifact(&self, session: &str, params: &Value) -> Result<Value, String> {
        let id = crate::text(params, "artifactId")?;
        let (content, hash): (String, String) = self
            .connection
            .query_row(
                "SELECT content,hash FROM conversation_artifacts WHERE session=?1 AND id=?2",
                params![session, id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Artifact is unavailable for this conversation")?;
        if params["hash"]
            .as_str()
            .is_some_and(|expected| expected != hash)
        {
            return Err("This operation is still updating; refresh its details".into());
        }
        let offset = params["offset"].as_u64().unwrap_or(0) as usize;
        if offset > content.len() || !content.is_char_boundary(offset) {
            return Err("Invalid artifact offset".into());
        }
        let chunk = bounded(&content[offset..], 12 * 1024);
        let end = offset + chunk.len();
        Ok(
            json!({"id":id,"hash":hash,"content":chunk,"offset":offset,"bytes":content.len(),
            "nextOffset":if end < content.len() {Some(end)} else {None}}),
        )
    }
    pub(super) fn history_page(
        &self,
        session: &str,
        before: Option<u64>,
    ) -> Result<(Vec<Value>, bool), String> {
        let mut query = self
            .connection
            .prepare(
                "SELECT data FROM conversation_items WHERE session=?1 AND position<?2
            ORDER BY position DESC LIMIT 101",
            )
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map(
                params![
                    session,
                    before.unwrap_or(i64::MAX as u64).min(i64::MAX as u64) as i64
                ],
                |r| r.get::<_, String>(0),
            )
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        let mut bytes = 0;
        let mut more = false;
        for row in rows {
            let data = row.map_err(|e| e.to_string())?;
            let mut item: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            public_item(&mut item);
            let size = item.to_string().len();
            if bytes + size > 20 * 1024 || items.len() == 100 {
                more = true;
                break;
            }
            bytes += size;
            items.push(item);
        }
        items.reverse();
        Ok((items, more))
    }
}
pub(super) fn public_item(item: &mut Value) {
    if let Some(map) = item.as_object_mut() {
        map.remove("action");
        map.remove("rpcId");
    }
}
