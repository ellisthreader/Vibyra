use super::{AgentRun, RunOutcome, RunSpec, RunStatus};
use crate::agentdb::{ids::now_ms, sql, AgentDb};
use crate::error::{CoreError, CoreResult};
use rusqlite::{params, Connection, Row};

const COLUMNS: &str = "id, account, chat_id, agent_id, status, spec, started_ms, ended_ms, message";
const MAX_RUNNING: i64 = 3;

pub fn begin(
    db: &AgentDb,
    id: &str,
    account: &str,
    chat: &str,
    agent: Option<&str>,
    spec: RunSpec,
) -> CoreResult<AgentRun> {
    let run = AgentRun {
        id: id.into(),
        account: account.into(),
        chat_id: chat.into(),
        agent_id: agent.map(str::to_owned),
        status: RunStatus::Running,
        spec,
        started_ms: now_ms(),
        ended_ms: None,
        message: None,
    };
    let payload = serde_json::to_string(&run.spec).map_err(json_error)?;
    db.transact(|cx| {
        let (owned, active): (bool, i64) = cx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM agent_chats WHERE id=?1 AND account=?2),
             (SELECT COUNT(*) FROM agent_runs WHERE status IN ('running','waiting'))",
                params![chat, account],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(sql)?;
        if !owned || active >= MAX_RUNNING {
            return Err(CoreError::Task(
                "Chat unavailable or task limit reached.".into(),
            ));
        }
        cx.execute(
            "INSERT INTO agent_runs (id,account,chat_id,agent_id,status,spec,started_ms)
            VALUES (?1,?2,?3,?4,'running',?5,?6)",
            params![id, account, chat, agent, payload, run.started_ms],
        )
        .map_err(sql)?;
        cx.execute(
            "UPDATE agent_chats SET state='running',updated_ms=?1 WHERE id=?2",
            params![run.started_ms, chat],
        )
        .map_err(sql)?;
        Ok(())
    })?;
    Ok(run)
}

pub fn finish(db: &AgentDb, account: &str, id: &str, outcome: &RunOutcome) -> CoreResult<()> {
    if outcome.status.active() {
        return Err(CoreError::Task("Run outcome must be terminal.".into()));
    }
    db.transact(|cx| {
        let run = get_in(cx, account, id)?;
        if !run.status.active() {
            return Err(CoreError::Task("Task has already ended.".into()));
        }
        cx.execute(
            "UPDATE agent_runs SET status=?1,message=?2,ended_ms=?3 WHERE id=?4",
            params![outcome.status.as_str(), outcome.message, now_ms(), id],
        )
        .map_err(sql)?;
        cx.execute(
            "UPDATE agent_chats SET state=?1,updated_ms=?2 WHERE id=?3",
            params![
                if outcome.status == RunStatus::Succeeded {
                    "idle"
                } else {
                    "failed"
                },
                now_ms(),
                run.chat_id
            ],
        )
        .map_err(sql)?;
        Ok(())
    })
}

pub fn set_waiting(db: &AgentDb, account: &str, id: &str, waiting: bool) -> CoreResult<()> {
    db.with(|cx| {
        cx.execute(
            "UPDATE agent_runs SET status=?1 WHERE id=?2 AND account=?3
            AND status IN ('running','waiting')",
            params![if waiting { "waiting" } else { "running" }, id, account],
        )
        .map_err(sql)?;
        Ok(())
    })
}

pub fn recover(db: &AgentDb) -> CoreResult<()> {
    db.transact(|cx| {
        cx.execute(
            "UPDATE agent_chats SET state='failed' WHERE id IN
            (SELECT chat_id FROM agent_runs WHERE status IN ('running','waiting'))",
            [],
        )
        .map_err(sql)?;
        cx.execute(
            "UPDATE agent_runs SET status='interrupted',ended_ms=?1,
            message='Vibyra closed before this task finished. Review its work before retrying.'
            WHERE status IN ('running','waiting')",
            [now_ms()],
        )
        .map_err(sql)?;
        Ok(())
    })
}

pub fn get(db: &AgentDb, account: &str, id: &str) -> CoreResult<AgentRun> {
    db.with(|cx| get_in(cx, account, id))
}

fn get_in(cx: &Connection, account: &str, id: &str) -> CoreResult<AgentRun> {
    cx.query_row(
        &format!("SELECT {COLUMNS} FROM agent_runs WHERE id=?1 AND account=?2"),
        params![id, account],
        row,
    )
    .map_err(sql)?
}

pub fn list(db: &AgentDb, account: &str, chat: Option<&str>) -> CoreResult<Vec<AgentRun>> {
    db.with(|cx| {
        let mut stmt = cx
            .prepare(&format!(
                "SELECT {COLUMNS} FROM agent_runs
            WHERE account=?1 AND (?2 IS NULL OR chat_id=?2) ORDER BY status IN ('running','waiting') DESC, started_ms DESC, id DESC LIMIT 100"
            ))
            .map_err(sql)?;
        let rows = stmt
            .query_map(params![account, chat], row)
            .map_err(sql)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql)?;
        rows.into_iter().collect()
    })
}

fn row(row: &Row<'_>) -> rusqlite::Result<CoreResult<AgentRun>> {
    let status: String = row.get(4)?;
    let spec: String = row.get(5)?;
    Ok((|| {
        Ok(AgentRun {
            id: row.get(0).map_err(sql)?,
            account: row.get(1).map_err(sql)?,
            chat_id: row.get(2).map_err(sql)?,
            agent_id: row.get(3).map_err(sql)?,
            status: serde_json::from_value(serde_json::Value::String(status))
                .map_err(json_error)?,
            spec: serde_json::from_str(&spec).map_err(json_error)?,
            started_ms: row.get(6).map_err(sql)?,
            ended_ms: row.get(7).map_err(sql)?,
            message: row.get(8).map_err(sql)?,
        })
    })())
}
fn json_error(error: serde_json::Error) -> CoreError {
    CoreError::Settings(error.to_string())
}
