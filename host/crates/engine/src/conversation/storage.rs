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
        let data = serde_json::to_string(conversation).map_err(|e| e.to_string())?;
        self.connection
            .execute(
                "INSERT INTO conversations(id,data) VALUES(?1,?2)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                params![id, data],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    pub(crate) fn conversations(&self) -> Result<HashMap<String, Conversation>, String> {
        self.connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,data TEXT NOT NULL)",
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
            conversation.restore();
            self.save_conversation(&id, &conversation)?;
            result.insert(id, conversation);
        }
        Ok(result)
    }
}
