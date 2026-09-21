use crate::{journal::Journal, state::State};
use rusqlite::params;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(super) fn rule_key(item: &Value) -> Option<String> {
    let action = &item["action"];
    if item["method"] != "item/commandExecution/requestApproval"
        || action["command"].as_str().is_none()
        || action["cwd"].as_str().is_none()
        || ["additionalPermissions", "networkApprovalContext"]
            .iter()
            .any(|key| !action[key].is_null())
        || action["kind"]
            .as_str()
            .is_some_and(|kind| kind != "command")
    {
        return None;
    }
    Some(format!(
        "{:x}",
        Sha256::digest(
            json!({"command":action["command"],"cwd":action["cwd"],
        "environmentId":action["environmentId"]})
            .to_string()
        )
    ))
}
impl Journal {
    pub(super) fn trust_rules(&self, project: &str) -> Result<Value, String> {
        let mut q = self
            .connection
            .prepare("SELECT id,command,cwd FROM conversation_trust WHERE project=?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = q.query_map([project],|r|Ok(json!({"id":r.get::<_,String>(0)?,"command":r.get::<_,String>(1)?,
            "cwd":r.get::<_,String>(2)?,"scope":"Exact command in this project and working directory"})))
            .map_err(|e| e.to_string())?;
        Ok(json!(rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?))
    }
    pub(super) fn save_trust(&self, project: &str, item: &Value) -> Result<(), String> {
        let key = rule_key(item).ok_or("Persistent trust is unavailable for this request")?;
        self.connection.execute("INSERT OR IGNORE INTO conversation_trust(project,id,command,cwd) VALUES(?1,?2,?3,?4)",
            params![project,key,item["action"]["command"].as_str(),item["action"]["cwd"].as_str()])
            .map_err(|e|e.to_string())?;
        Ok(())
    }
}
pub(super) fn auto_approve(state: &mut State, id: &str, request: &Value) -> Result<(), String> {
    let Some(key) = rule_key(request) else {
        return Ok(());
    };
    let project = state.session(id)?.meta.project_id.clone();
    let exists: bool = state
        .journal
        .connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM conversation_trust WHERE project=?1 AND id=?2)",
            params![project, key],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Ok(());
    }
    let c = state
        .conversations
        .get_mut(id)
        .ok_or("Conversation not found")?;
    let runtime = c
        .runtime
        .clone()
        .ok_or("Conversation process is unavailable")?;
    if c.receipts.len() >= 4096 {
        return Err("Conversation receipt limit reached".into());
    }
    let decision = uuid::Uuid::new_v4().to_string();
    c.receipts.insert(decision.clone(),json!({"device":"saved-project-rule","requestId":request["requestId"],"status":"dispatching"}));
    let mut item = request.clone();
    item["decisionId"] = json!(decision);
    item["status"] = json!("responding");
    item["decision"] = json!("accept");
    item["trustRule"] = json!(key);
    // The saved request is the automatic-decision receipt; never replay after restart.
    super::publish(state, id, Some(item.clone()))?;
    if runtime
        .write(json!({"id":item["rpcId"],"result":{"decision":"accept"}}))
        .is_err()
    {
        item["status"] = json!("unknown");
        super::publish(state, id, Some(item))?;
    }
    Ok(())
}
impl crate::Engine {
    pub(crate) fn revoke_conversation_trust(
        &self,
        device: &str,
        p: &Value,
    ) -> Result<Value, String> {
        if device != "desktop" {
            return Err("Manage saved trust on your Mac".into());
        }
        let id = crate::text(p, "sessionId")?;
        let rule = crate::text(p, "ruleId")?;
        let mut state = self.shared.lock();
        super::authorize(state.session(id)?, device, p)?;
        let project = state.session(id)?.meta.project_id.clone();
        state
            .journal
            .connection
            .execute(
                "DELETE FROM conversation_trust WHERE project=?1 AND id=?2",
                params![project, rule],
            )
            .map_err(|e| e.to_string())?;
        super::publish(&mut state, id, None)?;
        Ok(json!({"revoked":true}))
    }
}
