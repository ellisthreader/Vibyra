use crate::{
    agentdb::{sql, AgentDb},
    error::CoreResult,
};
use rusqlite::{params, OptionalExtension};

pub const SCHEMA: &str = "
CREATE TABLE agent_mail_tasks (
  mail_id TEXT PRIMARY KEY REFERENCES agent_mail(id) ON DELETE CASCADE,
  parent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  expected_output TEXT NOT NULL
);";

pub fn link_task(db: &AgentDb, mail: &str, parent: Option<&str>, expected: &str) -> CoreResult<()> {
    db.with(|cx| {
        cx.execute("INSERT INTO agent_mail_tasks (mail_id,parent_run_id,expected_output) VALUES (?1,?2,?3)",
            params![mail,parent,expected]).map_err(sql)?;
        Ok(())
    })
}
pub fn task_link(db: &AgentDb, mail: &str) -> CoreResult<Option<(Option<String>, String)>> {
    db.with(|cx| {
        cx.query_row(
            "SELECT parent_run_id,expected_output FROM agent_mail_tasks WHERE mail_id=?1",
            [mail],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql)
    })
}
