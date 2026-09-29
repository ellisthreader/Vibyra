use serde_json::{json, Value};

/// The phone calls the negative choice Decline. Codex's current CLI offers
/// `cancel` for its Esc row; older providers may still offer `decline`.
pub(super) fn decline(params: &Value) -> Option<Value> {
    let Some(available) = params["availableDecisions"].as_array() else {
        return Some(json!("decline"));
    };
    if available.contains(&json!("cancel")) {
        Some(json!("cancel"))
    } else if available.contains(&json!("decline")) {
        Some(json!("decline"))
    } else {
        None
    }
}

/// Only forward an exec-policy rule that Codex itself offered for this request.
/// The phone chooses a symbolic action; the Host keeps the provider's exact value.
pub(super) fn command_rule(params: &Value) -> Option<(Value, String)> {
    let offered = params["availableDecisions"]
        .as_array()?
        .iter()
        .find(|choice| {
            choice["acceptWithExecpolicyAmendment"]["execpolicy_amendment"].is_array()
        })?;
    let tokens = offered["acceptWithExecpolicyAmendment"]["execpolicy_amendment"].as_array()?;
    if tokens.is_empty()
        || tokens.len() > 16
        || tokens.iter().any(|token| {
            token.as_str().is_none_or(|text| {
                text.is_empty() || text.len() > 160 || text.chars().any(char::is_control)
            })
        })
        || json!(tokens).to_string().len() > 1024
    {
        return None;
    }
    if !params["proposedExecpolicyAmendment"].is_null()
        && params["proposedExecpolicyAmendment"] != json!(tokens)
    {
        return None;
    }
    Some((offered.clone(), format!("Codex will remember these exact command-prefix tokens: {}. Future matching commands may run without asking.", json!(tokens))))
}
