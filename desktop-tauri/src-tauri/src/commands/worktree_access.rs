use crate::state::AppState;
use serde_json::Value;
use tauri::State;

const CONNECT: &str =
    "Connect GitHub in the Worktrees sidebar before starting a Safe Mode worktree.";

/// Check the current account at the mutation boundary; never trust a renderer badge.
pub(super) async fn require_github(state: &State<'_, AppState>) -> Result<(), String> {
    if state.account.token().is_none() {
        return Err(CONNECT.into());
    }
    let catalogue = super::teammates::teammate_request(state.clone(), "connectors".into(), None)
        .await
        .map_err(|_| {
            "Could not verify your GitHub connection. Reconnect or retry in Worktrees.".to_string()
        })?;
    if connected(&catalogue) {
        Ok(())
    } else {
        Err(CONNECT.into())
    }
}

fn connected(catalogue: &Value) -> bool {
    catalogue["enabled"].as_bool() == Some(true)
        && catalogue["integrations"].as_array().is_some_and(|items| {
            items
                .iter()
                .any(|item| item["id"] == "github" && item["installed"].as_bool() == Some(true))
        })
}

#[cfg(test)]
mod tests {
    use super::connected;
    use serde_json::json;
    #[test]
    fn only_a_verified_enabled_github_connector_allows_worktrees() {
        assert!(connected(
            &json!({"enabled":true,"integrations":[{"id":"github","installed":true}]})
        ));
        for value in [
            json!({}),
            json!({"enabled":false,"integrations":[{"id":"github","installed":true}]}),
            json!({"enabled":true,"integrations":[{"id":"github","installed":false,"account":"ellis"}]}),
            json!({"enabled":true,"integrations":[{"id":"gitlab","installed":true}]}),
            json!({"enabled":true,"integrations":[{"id":"github","installed":"true"}]}),
        ] {
            assert!(!connected(&value));
        }
    }
}
