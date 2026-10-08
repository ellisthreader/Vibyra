use crate::account_api;
use serde_json::{json, Value};
use std::time::Duration;

pub async fn pending(token: &str, key: &str, grant_id: &str) -> Result<Vec<Value>, String> {
    let response = crate::http_client::shared()
        .get(format!(
            "{}/api/agents/v1/workspaces/{grant_id}/pending",
            account_api::base_url()
        ))
        .bearer_auth(token)
        .header("X-Vibyra-Runner-Key", key)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Agent Computer could not reach Vibyra Cloud".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Agent Computer poll was refused: {}",
            response.status().as_u16()
        ));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| "Invalid Agent Computer poll response")?;
    let tools = body["tools"]
        .as_array()
        .filter(|tools| tools.len() <= 4)
        .ok_or("Invalid Agent Computer tool batch")?;
    Ok(tools.clone())
}

pub async fn result(
    token: &str,
    key: &str,
    grant_id: &str,
    tool_id: &str,
    value: Value,
) -> Result<(), String> {
    let response = crate::http_client::shared()
        .post(format!(
            "{}/api/agents/v1/workspaces/{grant_id}/tools/{tool_id}/result",
            account_api::base_url()
        ))
        .bearer_auth(token)
        .header("X-Vibyra-Runner-Key", key)
        .json(&json!({"result":value}))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Agent Computer result delivery was interrupted".to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Agent Computer result was refused: {}",
            response.status().as_u16()
        ))
    }
}

pub async fn claim(
    token: &str,
    key: &str,
    grant_id: &str,
    tool_id: &str,
    fingerprint: &str,
) -> Result<(), String> {
    let response = crate::http_client::shared()
        .post(format!(
            "{}/api/agents/v1/workspaces/{grant_id}/tools/{tool_id}/claim",
            account_api::base_url()
        ))
        .bearer_auth(token)
        .header("X-Vibyra-Runner-Key", key)
        .json(&json!({"fingerprint":fingerprint}))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Agent Computer could not confirm edit dispatch".to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Agent Computer edit was refused: {}",
            response.status().as_u16()
        ))
    }
}

#[cfg(test)]
#[path = "agent_computer_transport_tests.rs"]
mod tests;
