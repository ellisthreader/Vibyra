use crate::{
    agentdb::{sql, AgentDb},
    error::CoreResult,
};
pub fn archived(
    db: &AgentDb,
    account: &str,
    agent: Option<&str>,
) -> CoreResult<Vec<super::AgentChat>> {
    db.with(|cx| {
        let mut statement = cx.prepare(&format!("SELECT {} FROM agent_chats WHERE account=?1 AND agent_id IS ?2 AND archived_ms IS NOT NULL ORDER BY updated_ms DESC LIMIT 300", super::record::COLUMNS)).map_err(sql)?;
        let rows = statement.query_map(rusqlite::params![account, agent], |row| Ok(super::AgentChat::from_row(row))).map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)?.into_iter().collect()
    })
}
pub fn ids_for_agent(db: &AgentDb, account: &str, agent: &str) -> CoreResult<Vec<String>> {
    db.with(|cx| {
        let mut statement = cx
            .prepare("SELECT id FROM agent_chats WHERE agent_id=?1 AND account=?2")
            .map_err(sql)?;
        let rows = statement
            .query_map(rusqlite::params![agent, account], |row| row.get(0))
            .map_err(sql)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql)
    })
}
