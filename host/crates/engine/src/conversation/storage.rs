use super::model::Conversation;
use crate::journal::Journal;
use rusqlite::params;
use std::collections::HashMap;
impl Journal {
    pub(crate) fn save_conversation(
        &self,
        id: &str,
        conversation: &Conversation,
    ) -> Result<(), String> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        if conversation.cursor > 100000 {
            return Err("Conversation reached its retained event limit. Start a new chat.".into());
        }
        for item in conversation.items.iter().filter(|item| {
            conversation.process_state != "running"
                || item["cursor"].as_u64() == Some(conversation.cursor)
                || matches!(item["status"].as_str(), Some("expired" | "unknown"))
        }) {
            transaction
                .execute(
                    "INSERT INTO conversation_items(session,id,position,data) VALUES(?1,?2,?3,?4)
                ON CONFLICT(session,id) DO UPDATE SET data=excluded.data WHERE data<>excluded.data",
                    params![
                        id,
                        item["id"].as_str().unwrap_or(""),
                        item["order"].as_i64().unwrap_or(0),
                        item.to_string()
                    ],
                )
                .map_err(|e| e.to_string())?;
        }
        if let Some(event) = conversation.events.last() {
            let item = &event["item"];
            let record = serde_json::json!({"cursor":event["cursor"],"turnId":event["turnId"],"turnState":event["turnState"],
                "itemId":item["id"],"kind":item["kind"],"status":item["status"],"artifact":item["artifact"],
                "updatedAt":item["updatedAt"],"decisionScope":item["decisionScope"]});
            transaction.execute("INSERT OR IGNORE INTO conversation_event_records(session,cursor,data) VALUES(?1,?2,?3)",
                params![id,conversation.cursor as i64,record.to_string()]).map_err(|e|e.to_string())?;
        }
        let data = serde_json::to_string(conversation).map_err(|e| e.to_string())?;
        self.connection
            .execute(
                "INSERT INTO conversations(id,data) VALUES(?1,?2)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                params![id, data],
            )
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())
    }
    pub(crate) fn conversations(&self) -> Result<HashMap<String, Conversation>, String> {
        self.connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS conversation_legacy_backup AS SELECT * FROM conversations;
                CREATE TABLE IF NOT EXISTS conversation_items(session TEXT NOT NULL,id TEXT NOT NULL,
                    position INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session,id));
                CREATE INDEX IF NOT EXISTS conversation_history ON conversation_items(session,position);
                CREATE TABLE IF NOT EXISTS conversation_event_records(session TEXT NOT NULL,cursor INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(session,cursor));
                CREATE TABLE IF NOT EXISTS conversation_uploads(session TEXT NOT NULL,id TEXT NOT NULL,device TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,content TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(session,id));
                CREATE TABLE IF NOT EXISTS conversation_trust(project TEXT NOT NULL,id TEXT NOT NULL,command TEXT NOT NULL,cwd TEXT NOT NULL,PRIMARY KEY(project,id));
                CREATE TABLE IF NOT EXISTS conversation_artifacts(session TEXT NOT NULL,id TEXT NOT NULL,
                    content TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(session,id));",
            )
            .map_err(|e| e.to_string())?;
        let mut query = self
            .connection
            .prepare("SELECT id,data FROM conversations")
            .map_err(|e| e.to_string())?;
        let rows = query
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut result = HashMap::new();
        for row in rows {
            let (id, data) = row.map_err(|e| e.to_string())?;
            let mut conversation: Conversation =
                serde_json::from_str(&data).map_err(|e| e.to_string())?;
            // Items or events inside the row itself are the old layout, moved
            // out into their own tables by the save below.
            let legacy = !conversation.items.is_empty() || !conversation.events.is_empty();
            if conversation.items.is_empty() {
                let mut history = self.connection.prepare("SELECT data FROM conversation_items WHERE session=?1 AND
                    (position IN (SELECT position FROM conversation_items WHERE session=?1 ORDER BY position DESC LIMIT 512)
                    OR json_extract(data,'$.status') IN ('pending','responding')) ORDER BY position").map_err(|e|e.to_string())?;
                let items = history
                    .query_map([&id], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?;
                for item in items {
                    conversation.items.push(
                        serde_json::from_str(&item.map_err(|e| e.to_string())?)
                            .map_err(|e| e.to_string())?,
                    );
                }
            }
            // A conversation left at rest last time is already stored as
            // restore leaves it; rewriting every one of them, a synced commit
            // each, held up opening every project.
            if conversation.restore() || legacy {
                self.save_conversation(&id, &conversation)?;
            }
            result.insert(id, conversation);
        }
        Ok(result)
    }
}
