pub const RUNS: &str = r#"
CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    chat_id TEXT NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
    agent_id TEXT,
    status TEXT NOT NULL,
    spec TEXT NOT NULL,
    started_ms INTEGER NOT NULL,
    ended_ms INTEGER,
    message TEXT
);
CREATE UNIQUE INDEX agent_runs_one_active_chat ON agent_runs(chat_id)
    WHERE status IN ('running', 'waiting');
CREATE INDEX agent_runs_account_time ON agent_runs(account, started_ms DESC);
CREATE TABLE agent_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_ms INTEGER NOT NULL
);
CREATE TABLE agent_run_inputs (
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL REFERENCES chat_attachments(id) ON DELETE CASCADE,
    PRIMARY KEY(run_id, attachment_id)
);
CREATE TABLE agent_run_proposals (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE);
"#;
