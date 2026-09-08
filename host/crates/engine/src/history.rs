use crate::state::State;
use serde_json::{json, Value};

impl State {
    pub fn history(&self, params: &Value, budget: usize) -> Result<Value, String> {
        let limit = match params.get("limit") {
            None => 50,
            Some(limit) => limit
                .as_u64()
                .filter(|limit| (1..=100).contains(limit))
                .ok_or("history limit must be between 1 and 100")?
                as usize,
        };
        let mut sessions: Vec<_> = self
            .sessions
            .values()
            .map(|session| &session.meta)
            .collect();
        sessions.sort_by(|a, b| {
            (b.status == "running")
                .cmp(&(a.status == "running"))
                .then_with(|| b.created_at.cmp(&a.created_at))
                .then_with(|| b.id.cmp(&a.id))
        });
        let start = match params.get("cursor") {
            None | Some(Value::Null) => 0,
            Some(cursor) => {
                let cursor = cursor.as_str().ok_or("invalid session history cursor")?;
                sessions
                    .iter()
                    .position(|session| session.id == cursor)
                    .map(|position| position + 1)
                    .ok_or("session history cursor no longer exists")?
            }
        };
        let mut bytes = 0;
        let mut page = Vec::new();
        for session in sessions.iter().skip(start).take(limit) {
            bytes += serde_json::to_vec(session)
                .map_err(|e| e.to_string())?
                .len()
                + 1;
            if bytes > budget {
                break;
            }
            page.push(*session);
        }
        let next_cursor = if start + page.len() < sessions.len() {
            page.last().map(|session| session.id.as_str())
        } else {
            None
        };
        Ok(json!({"sessions":page,"nextCursor":next_cursor,"sessionCount":sessions.len()}))
    }
}
