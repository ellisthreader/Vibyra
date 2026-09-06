use crate::agentdb::{
    ids::{new_id, now_ms},
    sql, AgentDb,
};
use crate::error::{CoreError, CoreResult};
use rusqlite::params;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub run_id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub created_ms: i64,
}

pub fn save_artifact(
    db: &AgentDb,
    account: &str,
    run: &str,
    kind: &str,
    title: &str,
    content: &str,
) -> CoreResult<Artifact> {
    super::get(db, account, run)?;
    if content.len() > 2 * 1024 * 1024 {
        return Err(CoreError::Task(
            "Task artifact exceeds the 2 MiB limit.".into(),
        ));
    }
    let artifact = Artifact {
        id: new_id(),
        run_id: run.into(),
        kind: kind.into(),
        title: title.chars().take(200).collect(),
        content: content.into(),
        created_ms: now_ms(),
    };
    db.with(|cx| {
        cx.execute(
            "INSERT INTO agent_artifacts (id,run_id,kind,title,content,created_ms)
            VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                artifact.id,
                run,
                kind,
                artifact.title,
                content,
                artifact.created_ms
            ],
        )
        .map_err(sql)?;
        Ok(())
    })?;
    Ok(artifact)
}

pub fn artifact_list(db: &AgentDb, account: &str, run: &str) -> CoreResult<Vec<Artifact>> {
    super::get(db, account, run)?;
    db.with(|cx| {
        let mut stmt = cx
            .prepare(
                "SELECT id,run_id,kind,title,content,created_ms
            FROM agent_artifacts WHERE run_id=?1 ORDER BY created_ms",
            )
            .map_err(sql)?;
        let result = stmt
            .query_map([run], |row| {
                Ok(Artifact {
                    id: row.get(0)?,
                    run_id: row.get(1)?,
                    kind: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    created_ms: row.get(5)?,
                })
            })
            .map_err(sql)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql);
        result
    })
}
