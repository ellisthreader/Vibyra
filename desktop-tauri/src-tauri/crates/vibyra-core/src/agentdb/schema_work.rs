//! Migration 1, second half: the work a teammate does over time.
//!
//! Unlike the chat tables, the audit rows here outlive what they point at.
//! `approval_requests` and `agent_mail` keep their own copy of who acted and
//! on what and null their links instead of cascading: an approval that
//! authorised a real external effect must stay readable after the agent that
//! asked for it is deleted.

/// Skills, routines, mail, plugin grants, and the approval ledger.
pub const SKILLS_AND_WORK: &str = r#"
CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  account       TEXT NOT NULL,
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1,
  trigger       TEXT NOT NULL DEFAULT '',
  procedure     TEXT NOT NULL DEFAULT '',
  verification  TEXT NOT NULL DEFAULT '',
  boundary      TEXT NOT NULL DEFAULT '',
  origin        TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'installed',
  created_ms    INTEGER NOT NULL,
  updated_ms    INTEGER NOT NULL
);
CREATE INDEX skills_account ON skills(account, status, name);

CREATE TABLE skill_versions (
  id           TEXT PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  snapshot     TEXT NOT NULL,
  created_ms   INTEGER NOT NULL,
  UNIQUE(skill_id, version)
);

CREATE TABLE agent_skill_grants (
  agent_id  TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  skill_id  TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  enabled   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(agent_id, skill_id)
);

CREATE TABLE routines (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  instruction   TEXT NOT NULL,
  schedule_kind TEXT NOT NULL,
  schedule_spec TEXT NOT NULL,
  timezone      TEXT NOT NULL,
  permission    TEXT NOT NULL DEFAULT 'plan',
  enabled       INTEGER NOT NULL DEFAULT 1,
  next_run_ms   INTEGER,
  created_ms    INTEGER NOT NULL,
  updated_ms    INTEGER NOT NULL
);
CREATE INDEX routines_due ON routines(enabled, next_run_ms);

CREATE TABLE routine_runs (
  id            TEXT PRIMARY KEY,
  routine_id    TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  chat_id       TEXT REFERENCES agent_chats(id) ON DELETE SET NULL,
  scheduled_ms  INTEGER NOT NULL,
  started_ms    INTEGER,
  ended_ms      INTEGER,
  status        TEXT NOT NULL,
  error         TEXT,
  created_ms    INTEGER NOT NULL
);
CREATE INDEX routine_runs_recent ON routine_runs(routine_id, scheduled_ms DESC);

CREATE TABLE agent_mail (
  id           TEXT PRIMARY KEY,
  chain_id     TEXT NOT NULL,
  parent_id    TEXT,
  sender_id    TEXT,
  sender_name  TEXT NOT NULL DEFAULT '',
  recipient_id TEXT,
  chat_id      TEXT REFERENCES agent_chats(id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL,
  hop          INTEGER NOT NULL DEFAULT 0,
  digest       TEXT NOT NULL DEFAULT '',
  created_ms   INTEGER NOT NULL
);
CREATE INDEX agent_mail_chain ON agent_mail(chain_id, created_ms);
CREATE INDEX agent_mail_dedupe ON agent_mail(sender_id, digest, created_ms DESC);

-- Who each agent may write to. An empty list means nobody, which is why
-- `mail_enabled` alone is not enough to reach anyone: enabling messaging says
-- an agent may be spoken to, and a row here says who may speak to whom.
CREATE TABLE agent_mail_allow (
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  peer_id  TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY(agent_id, peer_id)
);
CREATE INDEX agent_mail_inbox ON agent_mail(recipient_id, created_ms DESC);

CREATE TABLE plugin_connections (
  id           TEXT PRIMARY KEY,
  account      TEXT NOT NULL,
  plugin_id    TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  secret_ref   TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'connected',
  created_ms   INTEGER NOT NULL,
  UNIQUE(account, plugin_id)
);

CREATE TABLE agent_plugin_grants (
  agent_id      TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES plugin_connections(id) ON DELETE CASCADE,
  capability    TEXT NOT NULL,
  PRIMARY KEY(agent_id, connection_id, capability)
);

CREATE TABLE approval_requests (
  id           TEXT PRIMARY KEY,
  account      TEXT NOT NULL,
  agent_id     TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  agent_name   TEXT NOT NULL DEFAULT '',
  chat_id      TEXT REFERENCES agent_chats(id) ON DELETE SET NULL,
  turn_id      TEXT,
  risk         TEXT NOT NULL,
  action       TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT '',
  detail       TEXT NOT NULL DEFAULT '',
  cost_usd     REAL,
  fingerprint  TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'pending',
  resolution   TEXT,
  created_ms   INTEGER NOT NULL,
  resolved_ms  INTEGER
);
CREATE INDEX approval_requests_pending ON approval_requests(account, state, created_ms DESC);
"#;
