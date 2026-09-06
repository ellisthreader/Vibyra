use crate::{
    agentdb::{ids::new_id, sql, AgentDb},
    error::CoreResult,
};
use rusqlite::params;

pub fn input_sent(db: &AgentDb, chat: &str, attachment: &str) -> CoreResult<bool> {
    db.with(|cx| cx.query_row("SELECT EXISTS(SELECT 1 FROM agent_run_inputs i JOIN agent_runs r ON r.id=i.run_id WHERE i.attachment_id=?1 AND r.chat_id=?2 AND r.status='succeeded')",
        params![attachment, chat], |row| row.get(0)).map_err(sql))
}
pub fn record_inputs(db: &AgentDb, account: &str, run: &str) -> CoreResult<()> {
    let task = super::get(db, account, run)?;
    db.with(|cx| {
        cx.execute("INSERT INTO agent_run_inputs (run_id,attachment_id) SELECT ?1,id FROM chat_attachments WHERE chat_id=?2",params![run,task.chat_id]).map_err(sql)?;
        Ok(())
    })
}
pub fn reserve_proposal(db: &AgentDb, account: &str, run: &str) -> CoreResult<bool> {
    db.with(|cx| cx.execute("INSERT INTO agent_run_proposals (id,run_id) SELECT ?1,id FROM agent_runs WHERE id=?2 AND account=?3 AND status IN ('running','waiting') AND (SELECT COUNT(*) FROM agent_run_proposals WHERE run_id=?2)<3",
        params![new_id(),run,account]).map(|count| count == 1).map_err(sql))
}
