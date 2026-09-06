use super::{record::COLUMNS, AgentProfile};
use crate::{
    agentdb::{sql, AgentDb},
    error::CoreResult,
};
pub fn archived(db: &AgentDb, account: &str) -> CoreResult<Vec<AgentProfile>> {
    db.with(|cx| {
        let mut statement = cx.prepare(&format!("SELECT {COLUMNS} FROM agent_profiles WHERE account=?1 AND archived_ms IS NOT NULL ORDER BY archived_ms DESC")).map_err(sql)?;
        let rows = statement.query_map([account], |row| Ok(AgentProfile::from_row(row))).map_err(sql)?;
        rows.collect::<Result<Vec<_>,_>>().map_err(sql)?.into_iter().collect()
    })
}
