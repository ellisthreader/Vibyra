//! What a chat is, and what one line of its transcript is.

use serde::{Deserialize, Serialize};

use crate::agent_model::{ChatSource, Engine};
use crate::agent_runtime::AgentEvent;
use crate::agentdb::sql;
use crate::error::CoreResult;

/// One conversation.
///
/// `agent_id` is nullable, and that null is Chat Mode: a chat with no
/// teammate, no brief, no memory and — unless the user mounts one — no place.
/// The same table holds both because they are the same thing to the runtime,
/// and having one transcript store rather than two is what stopped the old
/// in-memory project companion from being a third kind of conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChat {
    pub id: String,
    pub account: String,
    pub agent_id: Option<String>,
    pub title: String,
    pub engine: Engine,
    /// The provider conversation this chat *is*. `None` until the first turn
    /// names one, which for Codex is only after that turn has started.
    pub session_id: Option<String>,
    /// `idle`, `running`, or `failed`. Never a lock: a chat found `running`
    /// after a crash is reset on load, because no process survived.
    pub state: String,
    pub source: ChatSource,
    /// A folder a detached chat has been explicitly given. Agent chats leave
    /// this null and use their agent's places instead.
    pub mounted_place: Option<String>,
    pub pinned: bool,
    pub created_ms: i64,
    pub updated_ms: i64,
    pub archived_ms: Option<i64>,
}

pub const COLUMNS: &str = "id, account, agent_id, title, engine, session_id, state, source, \
     mounted_place, pinned, created_ms, updated_ms, archived_ms";

impl AgentChat {
    pub fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<Self> {
        let engine: String = row.get(4).map_err(sql)?;
        let source: String = row.get(7).map_err(sql)?;
        Ok(Self {
            id: row.get(0).map_err(sql)?,
            account: row.get(1).map_err(sql)?,
            agent_id: row.get(2).map_err(sql)?,
            title: row.get(3).map_err(sql)?,
            engine: Engine::parse(&engine),
            session_id: row.get(5).map_err(sql)?,
            state: row.get(6).map_err(sql)?,
            source: ChatSource::parse(&source),
            mounted_place: row.get(8).map_err(sql)?,
            pinned: row.get::<_, i64>(9).map_err(sql)? != 0,
            created_ms: row.get(10).map_err(sql)?,
            updated_ms: row.get(11).map_err(sql)?,
            archived_ms: row.get(12).map_err(sql)?,
        })
    }

    /// Whether this chat can reach anything of the user's.
    ///
    /// The question Chat Mode's composer asks before it claims to be detached,
    /// and the reason `mounted_place` is a column rather than a UI flag.
    pub fn detached(&self) -> bool {
        self.agent_id.is_none() && self.mounted_place.is_none()
    }
}

/// One stored transcript line, as the frontend receives it.
///
/// `seq` is the chat's own counter, not a timestamp: two events written in the
/// same millisecond still have an order, and a reducer that has seen `seq`
/// can ignore a duplicate delivery without comparing payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEventRow {
    pub chat_id: String,
    pub turn_id: String,
    pub seq: i64,
    pub created_ms: i64,
    /// The normalized event itself, flattened so the frontend sees
    /// `{ kind, …payload }` rather than a wrapper it has to unpick.
    #[serde(flatten)]
    pub event: AgentEvent,
}
