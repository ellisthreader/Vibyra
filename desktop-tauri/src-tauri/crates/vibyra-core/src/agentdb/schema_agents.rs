//! Migration 1, first half: the teammate and everything a conversation owns.
//!
//! Deletion policy lives in the foreign keys rather than in prose. Chat-owned
//! rows cascade — a deleted chat has no transcript to keep — and agent-owned
//! configuration cascades with the agent, which is why deleting one is a typed
//! confirmation rather than a button.

/// Profiles, their granted places, their chats, and the ordered event log.
pub const AGENTS_AND_CHATS: &str = r#"
CREATE TABLE agent_profiles (
  id             TEXT PRIMARY KEY,
  account        TEXT NOT NULL,
  name           TEXT NOT NULL,
  brief          TEXT NOT NULL DEFAULT '',
  engine         TEXT NOT NULL,
  model          TEXT,
  effort         TEXT,
  permission     TEXT NOT NULL DEFAULT 'standard',
  memory_budget  INTEGER NOT NULL DEFAULT 4000,
  reflection     TEXT NOT NULL DEFAULT 'suggest',
  home_path      TEXT NOT NULL,
  accent         TEXT NOT NULL DEFAULT '',
  mail_enabled   INTEGER NOT NULL DEFAULT 0,
  routines_allowed INTEGER NOT NULL DEFAULT 1,
  created_ms     INTEGER NOT NULL,
  updated_ms     INTEGER NOT NULL,
  archived_ms    INTEGER
);
CREATE INDEX agent_profiles_account ON agent_profiles(account, archived_ms, updated_ms DESC);

CREATE TABLE agent_places (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  access     TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_ms INTEGER NOT NULL,
  UNIQUE(agent_id, path)
);

CREATE TABLE agent_chats (
  id            TEXT PRIMARY KEY,
  account       TEXT NOT NULL,
  agent_id      TEXT REFERENCES agent_profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  engine        TEXT NOT NULL,
  session_id    TEXT,
  state         TEXT NOT NULL DEFAULT 'idle',
  source        TEXT NOT NULL DEFAULT 'user',
  mounted_place TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_ms    INTEGER NOT NULL,
  updated_ms    INTEGER NOT NULL,
  archived_ms   INTEGER
);
CREATE INDEX agent_chats_agent ON agent_chats(agent_id, archived_ms, updated_ms DESC);
CREATE INDEX agent_chats_detached ON agent_chats(account, agent_id, updated_ms DESC);

CREATE TABLE chat_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    TEXT NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
  turn_id    TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX chat_events_order ON chat_events(chat_id, seq);
CREATE INDEX chat_events_turn ON chat_events(turn_id);

CREATE TABLE chat_attachments (
  id           TEXT PRIMARY KEY,
  chat_id      TEXT NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
  original     TEXT NOT NULL,
  managed_path TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT '',
  bytes        INTEGER NOT NULL DEFAULT 0,
  created_ms   INTEGER NOT NULL
);
CREATE INDEX chat_attachments_chat ON chat_attachments(chat_id);

CREATE TABLE memory_entries (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  class        TEXT NOT NULL,
  body         TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 50,
  pinned       INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active',
  source_chat  TEXT,
  source_turn  TEXT,
  created_ms   INTEGER NOT NULL,
  updated_ms   INTEGER NOT NULL
);
CREATE INDEX memory_entries_rank ON memory_entries(agent_id, status, pinned DESC, priority DESC, updated_ms DESC);
"#;
