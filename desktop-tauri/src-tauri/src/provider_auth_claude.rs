use serde_json::Value;

use crate::provider_auth_home::AccountHome;
use crate::provider_auth_identity::{plan_name, product_detail, safe_label};
use crate::provider_auth_process::command_output;
use crate::provider_auth_state::AuthSnapshot;

pub fn probe(program: &str, home: &AccountHome) -> AuthSnapshot {
    let Some((success, output)) =
        command_output(program, &["auth", "status", "--json"], home.env())
    else {
        return AuthSnapshot::failed();
    };
    let Ok(value) = serde_json::from_str::<Value>(&output) else {
        return AuthSnapshot::failed();
    };
    let auth_method = value
        .get("authMethod")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !success
        || auth_method != "claude.ai"
        || !value
            .get("loggedIn")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return AuthSnapshot::default();
    }
    let email = value.get("email").and_then(Value::as_str).unwrap_or("");
    let plan = value
        .get("subscriptionType")
        .and_then(Value::as_str)
        .unwrap_or("");
    AuthSnapshot {
        connected: true,
        account_label: safe_label(email, "Claude account"),
        detail: product_detail("Claude", &plan_name(plan)),
        ..AuthSnapshot::default()
    }
}
