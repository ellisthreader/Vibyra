use super::{safe_path, Grant};
use serde_json::{json, Value};

pub(super) fn perform(
    grant: &Grant,
    engine: &vibyra_engine::Engine,
    tool: &Value,
) -> Result<Value, String> {
    if !grant.can_write {
        return Err("This Mac folder was granted for reading only.".into());
    }
    grant.validate_path()?;
    if tool["operation"] != "write_file"
        || tool["approval"]["state"] != "dispatching"
        || !tool["approval"]["fingerprint"]
            .as_str()
            .is_some_and(|hash| {
                hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
    {
        return Err("This exact Mac edit was not approved.".into());
    }
    let id = tool["id"].as_str().ok_or("Missing edit identity")?;
    let turn = tool["turnId"].as_str().ok_or("Missing task identity")?;
    let expiry = tool["expiresAt"].as_i64().ok_or("Missing edit expiry")?;
    let args = &tool["arguments"];
    let path = args["path"].as_str().ok_or("Missing edit path")?;
    let content = args["content"].as_str().ok_or("Missing edit content")?;
    let expected = args["expectedSha256"]
        .as_str()
        .ok_or("Missing file version")?;
    if !safe_path(path)
        || path.is_empty()
        || content.len() > 8192
        || content.contains('\0')
        || !(expected == "new"
            || expected.len() == 64 && expected.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err("This file edit is outside the granted project or is too large.".into());
    }
    let project = engine.handle("agent-computer", "host.state", json!({}))?["projects"][0]["id"]
        .as_str()
        .ok_or("The project is unavailable")?
        .to_owned();
    let bound = engine.handle(
        "agent-computer",
        "vibes.bind",
        json!({
        "projectId":project,"chatId":turn,"accountToken":grant.id}),
    )?;
    let binding = bound["binding"]
        .as_str()
        .ok_or("The Mac did not create an edit receipt")?;
    let result = engine.handle(
        "agent-computer",
        "vibes.tool",
        json!({
        "projectId":project,"binding":binding,"chatId":turn,"accountToken":grant.id,
        "toolId":id,"operation":"write_file","decision":"allow","expiresAt":expiry,
        "path":path,"content":content,"expectedSha256":expected}),
    )?;
    if result.to_string().len() > 15000 {
        return Err("The Mac edit receipt is too large.".into());
    }
    Ok(result)
}
