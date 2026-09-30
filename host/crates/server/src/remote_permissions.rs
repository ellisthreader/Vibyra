//! Explicit RPC/event policy for remotely authorized sessions. Unknown methods
//! remain denied even when the backend grows new capabilities.
use crate::remote_authorization::{Access, DENIED};
use serde_json::{json, Value};

pub(crate) fn known(permission: &str) -> bool {
    matches!(
        permission,
        "screen:view"
            | "mouse:control"
            | "keyboard:control"
            | "clipboard:read"
            | "clipboard:write"
            | "terminal:access"
            | "files:read"
            | "files:download"
            | "files:upload"
            | "preview:access"
    )
}
pub(crate) fn permits(access: &Access, permission: &str) -> bool {
    access
        .as_ref()
        .is_none_or(|grant| grant.permits(permission))
}
pub(crate) fn valid(access: &Access) -> Result<(), String> {
    access.as_ref().map_or(Ok(()), |grant| grant.valid())
}
pub(crate) fn request(access: &Access, method: &str, params: &Value) -> Result<(), String> {
    let Some(grant) = access else {
        return Ok(());
    };
    grant.valid()?;
    let needs: &[&str] = match method {
        "host.state" | "device.revoke" => &[],
        "session.list"
        | "session.snapshot"
        | "session.models"
        | "session.create"
        | "session.resumeSaved"
        | "session.stop"
        | "session.claim"
        | "session.input"
        | "session.release"
        | "session.resize"
        | "conversation.snapshot"
        | "conversation.events"
        | "conversation.resume"
        | "conversation.commands"
        | "conversation.status"
        | "conversation.models"
        | "conversation.usage"
        | "conversation.settings"
        | "turn.submit"
        | "turn.interrupt"
        | "turn.submissionStatus"
        | "decision.resolve"
        | "question.answer"
        | "conversation.trust.revoke"
        | "approval.list"
        | "approval.resolve"
        | "aiAccounts.list"
        | "aiAccounts.refresh"
        | "aiAccounts.connect"
        | "aiAccounts.add"
        | "aiAccounts.install"
        | "aiAccounts.cancel"
        | "aiAccounts.disconnect"
        | "aiAccounts.remove"
        | "aiAccounts.submit"
        | "aiAccounts.signInUrl"
        | "aiAccounts.openOnMac"
        | "aiAccounts.setDefault"
        | "scaffold.preflight"
        | "scaffold.status"
        | "scaffold.cancel"
        | "project.rename"
        | "project.forget" => &["terminal:access"],
        "conversation.artifact" => &["terminal:access", "files:read"],
        "conversation.attachment" => &["terminal:access", "files:upload"],
        "scaffold.start" | "scaffold.adopt" => &["terminal:access", "files:upload"],
        "project.files" | "project.read" | "project.search" | "project.diff" | "project.status"
        | "vibes.bind" => &["files:read"],
        "vibes.tool" if params["operation"] == "write_file" => &["files:upload"],
        "vibes.tool"
            if matches!(
                params["operation"].as_str(),
                Some("list_files" | "read_file" | "search_files")
            ) =>
        {
            &["files:read"]
        }
        "preview.list" if params["windowV1"] == true || params["windowHandoffV1"] == true => {
            &["preview:access", "screen:view"]
        }
        "preview.window.share" => &["preview:access", "screen:view"],
        "preview.list" | "preview.start" | "preview.open" | "preview.close" | "preview.fetch" => {
            &["preview:access"]
        }
        "preview.run" | "preview.stop" => &["preview:access", "terminal:access"],
        "focusedText.state"
        | "focusedText.claim"
        | "focusedText.snapshot"
        | "focusedText.edit"
        | "focusedText.release" => &["keyboard:control"],
        _ => return Err("This remote session does not permit that action".into()),
    };
    if needs.iter().all(|permission| grant.permits(permission)) {
        Ok(())
    } else {
        Err("This remote session does not permit that action".into())
    }
}
pub(crate) fn event(access: &Access, value: &Value) -> bool {
    if access.is_none() {
        return true;
    }
    let needed = match value["event"].as_str() {
        Some("host.changed") => return true,
        Some("preview.changed") => "preview:access",
        Some(
            "terminal.output"
            | "terminal.resync"
            | "terminal.size"
            | "terminal.exit"
            | "session.exit"
            | "session.controlChanged"
            | "conversation.updated"
            | "conversation.resync"
            | "conversation.controlChanged"
            | "scaffold.step"
            | "scaffold.output"
            | "scaffold.done",
        ) => "terminal:access",
        Some("focusedText.changed") => "keyboard:control",
        _ => return false,
    };
    permits(access, needed)
}
pub(crate) fn response(access: &Access, method: &str, mut value: Value) -> Result<Value, String> {
    valid(access)?;
    if access.is_none() || method != "host.state" {
        return Ok(value);
    }
    if !permits(access, "terminal:access") {
        for field in ["sessions", "approvals"] {
            value[field] = json!([]);
        }
        value["sessionCount"] = json!(0);
        value["nextCursor"] = Value::Null;
        for field in [
            "canInput",
            "canManage",
            "conversationV1",
            "sharedChatsV1",
            "aiAccountsV1",
            "scaffoldV1",
            "fundedTerminalV1",
            "terminalModelsV1",
        ] {
            value["capabilities"][field] = json!(false);
        }
    }
    if !permits(access, "files:read") && !permits(access, "terminal:access") {
        value["projects"] = json!([]);
    }
    if !permits(access, "files:read") {
        value["railway"] = Value::Null;
        value["capabilities"]["vibesToolsV1"] = json!(false);
    }
    if !permits(access, "keyboard:control") {
        value["capabilities"]["focusedTextV1"] = json!(false);
    }
    if !permits(access, "preview:access") {
        value["previews"] = json!([]);
        for field in [
            "previewV1",
            "previewWindowV1",
            "previewWindowHandoffV1",
            "previewRunV1",
            "previewHttpProofV1",
        ] {
            value["capabilities"][field] = json!(false);
        }
    }
    // Other paired phones are account security information, not desktop media.
    value["devices"] = json!([]);
    Ok(value)
}
pub(crate) fn preview(access: &Access) -> Result<(), String> {
    valid(access)?;
    if permits(access, "preview:access") {
        Ok(())
    } else {
        Err(DENIED.into())
    }
}
