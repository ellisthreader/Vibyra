//! Creating, listing, naming and retiring chats.

use rusqlite::params;

use crate::agent_model::{ChatSource, Engine};
use crate::agentdb::ids::{new_id, now_ms};
use crate::agentdb::{sql, AgentDb};
use crate::error::{CoreError, CoreResult};

use super::record::{AgentChat, COLUMNS};

/// A chat to open. `agent_id` absent means Chat Mode.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewChat {
    pub agent_id: Option<String>,
    pub engine: Engine,
    #[serde(default)]
    pub title: String,
    #[serde(default = "user_source")]
    pub source: ChatSource,
}

fn user_source() -> ChatSource {
    ChatSource::User
}

/// Opens a chat. Never touches any other chat — starting a new one is the
/// cheap, safe gesture, which is what lets the UI offer it instead of forcing
/// a user to clear the conversation they are in.
pub fn create(db: &AgentDb, account: &str, request: NewChat) -> CoreResult<AgentChat> {
    let now = now_ms();
    let chat = AgentChat {
        id: new_id(),
        account: account.to_string(),
        agent_id: request.agent_id,
        title: request.title.trim().chars().take(120).collect(),
        engine: request.engine,
        session_id: None,
        state: "idle".into(),
        source: request.source,
        mounted_place: None,
        pinned: false,
        created_ms: now,
        updated_ms: now,
        archived_ms: None,
    };
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_chats (id, account, agent_id, title, engine, state, source, \
                 created_ms, updated_ms) VALUES (?1, ?2, ?3, ?4, ?5, 'idle', ?6, ?7, ?7)",
                params![
                    chat.id,
                    chat.account,
                    chat.agent_id,
                    chat.title,
                    chat.engine.as_str(),
                    chat.source.as_str(),
                    now,
                ],
            )
            .map_err(sql)?;
        Ok(())
    })?;
    Ok(chat)
}

/// One agent's chats, pinned first then most recent. `agent_id` of `None`
/// lists Chat Mode's own conversations.
pub fn list(db: &AgentDb, account: &str, agent_id: Option<&str>) -> CoreResult<Vec<AgentChat>> {
    db.with(|connection| {
        let filter = match agent_id {
            Some(_) => "agent_id = ?2",
            None => "agent_id IS NULL AND ?2 IS NULL",
        };
        let query = format!(
            "SELECT {COLUMNS} FROM agent_chats WHERE account = ?1 AND {filter} \
             AND archived_ms IS NULL ORDER BY pinned DESC, updated_ms DESC LIMIT 300"
        );
        let mut statement = connection.prepare(&query).map_err(sql)?;
        let rows = statement
            .query_map(params![account, agent_id], |row| {
                Ok(AgentChat::from_row(row))
            })
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(sql)?
            .into_iter()
            .collect()
    })
}

pub fn get(db: &AgentDb, account: &str, id: &str) -> CoreResult<AgentChat> {
    db.with(|connection| get_in(connection, account, id))
}

pub(super) fn get_in(
    connection: &rusqlite::Connection,
    account: &str,
    id: &str,
) -> CoreResult<AgentChat> {
    let query = format!("SELECT {COLUMNS} FROM agent_chats WHERE id = ?1 AND account = ?2");
    connection
        .query_row(&query, params![id, account], |row| {
            Ok(AgentChat::from_row(row))
        })
        .map_err(|_| CoreError::Settings(format!("no chat {id} on this account")))?
}

/// Binds a chat to the provider conversation it turned out to be.
///
/// Written once and never rewritten to a different id: a chat is one
/// conversation for its whole life, and silently repointing it would make the
/// transcript above the change belong to something else.
pub fn bind_session(db: &AgentDb, chat_id: &str, session_id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_chats SET session_id = ?1, updated_ms = ?2 \
                 WHERE id = ?3 AND session_id IS NULL",
                params![session_id, now_ms(), chat_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Records what a chat is doing. `running` is a display state, never a lock —
/// see `reset_running`.
pub fn set_state(db: &AgentDb, chat_id: &str, state: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_chats SET state = ?1, updated_ms = ?2 WHERE id = ?3",
                params![state, now_ms(), chat_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// Clears every `running` chat at startup.
///
/// No process survives an app restart, so a chat still marked running is a
/// crash's leftover. Left alone it would show a spinner forever and refuse to
/// accept a turn; cleared, the user simply sends again.
pub fn reset_running(db: &AgentDb) -> CoreResult<usize> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_chats SET state = 'idle' WHERE state = 'running'",
                [],
            )
            .map_err(sql)
    })
}

pub fn delete(db: &AgentDb, account: &str, id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "DELETE FROM agent_chats WHERE id = ?1 AND account = ?2",
                params![id, account],
            )
            .map_err(sql)?;
        Ok(())
    })
}
