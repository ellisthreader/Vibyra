use crate::account_api::Endpoint;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CloudAction {
    Wake,
    Stop,
    Disconnect,
    Repair,
    Provider,
    Project,
}

pub(super) fn accepted(action: &CloudAction, status: u16, value: &Value) -> bool {
    (200..300).contains(&status)
        || (*action == CloudAction::Wake && status == 409 && value["code"] == "already_running")
}

fn valid_key(key: &str) -> bool {
    key.len() == 32
        && key
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

pub(super) fn action_request<'a>(
    action: &CloudAction,
    project_key: Option<&str>,
    provider: Option<&'a str>,
    enabled: Option<bool>,
    confirmed: bool,
    name: Option<&str>,
) -> Result<(Endpoint<'a>, Option<Value>), String> {
    let key = || {
        project_key
            .filter(|key| valid_key(key))
            .ok_or("Choose a valid Cloud project.")
    };
    let on = || enabled.ok_or("Choose whether Cloud may use this item.");
    Ok(match action {
        CloudAction::Wake => (
            Endpoint::CloudComputerWake,
            Some(json!({"acceptTerms": true})),
        ),
        CloudAction::Stop => (Endpoint::CloudComputerStop, Some(json!({}))),
        CloudAction::Disconnect => {
            if !confirmed {
                return Err("Confirm deleting everything in Vibyra Cloud first.".into());
            }
            (Endpoint::CloudComputerDisconnect, None)
        }
        CloudAction::Repair => {
            let body = if project_key.is_some() {
                json!({"projectKey": key()?})
            } else {
                json!({})
            };
            (Endpoint::CloudComputerRepair, Some(body))
        }
        CloudAction::Provider => {
            let provider = provider
                .filter(|p| matches!(*p, "claude" | "codex" | "github"))
                .ok_or("Choose a supported Cloud account.")?;
            (
                Endpoint::CloudComputerProvider(provider),
                Some(json!({"enabled": on()?})),
            )
        }
        CloudAction::Project => {
            let enabled = on()?;
            if !enabled && !confirmed {
                return Err("Confirm removing this project's Cloud copy first.".into());
            }
            let mut item = json!({"projectKey": key()?, "allowed": enabled});
            if let Some(name) = name {
                if name.is_empty()
                    || name.chars().count() > 120
                    || name.chars().any(char::is_control)
                {
                    return Err("Choose a valid project name.".into());
                }
                item["name"] = json!(name);
            }
            (
                Endpoint::CloudComputerProjects,
                Some(json!({"source":"mac", "projects":[item]})),
            )
        }
    })
}
