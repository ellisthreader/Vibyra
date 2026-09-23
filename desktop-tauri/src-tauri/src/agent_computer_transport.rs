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
mod tests {
    use super::*;
    use crate::agent_computer_store::Grant;
    use crate::agent_computer_tools;
    use std::path::PathBuf;

    /// Run explicitly against an isolated local Laravel server and model stub.
    /// The normal test suite never uses a personal account or live provider.
    #[test]
    #[ignore]
    fn local_backend_and_real_mac_read_complete_one_everyday_task() {
        let read = |name: &str| std::fs::read_to_string(std::env::var(name).unwrap()).unwrap();
        let token = read("VIBYRA_AGENT_SMOKE_TOKEN_FILE");
        let key = read("VIBYRA_AGENT_SMOKE_KEY_FILE");
        let id = read("VIBYRA_AGENT_SMOKE_WORKSPACE_FILE");
        let root = PathBuf::from(std::env::var("VIBYRA_AGENT_SMOKE_PROJECT").unwrap())
            .canonicalize()
            .unwrap();
        let grant = Grant {
            id: id.clone(),
            agent_id: "smoke".into(),
            host_id: "b".repeat(64),
            account_scope: "smoke".into(),
            label: "Smoke project".into(),
            path: root,
            source_path: None,
            can_write: false,
            revoked: false,
        };
        let state = tempfile::tempdir().unwrap();
        let engine = agent_computer_tools::open(&grant, state.path()).unwrap();
        let operation =
            std::env::var("VIBYRA_AGENT_SMOKE_OPERATION").unwrap_or_else(|_| "read_file".into());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let tools = pending(&token, &key, &id).await.unwrap();
            assert_eq!(tools.len(), 1);
            assert_eq!(tools[0]["operation"], operation);
            let tool_id = tools[0]["id"].as_str().unwrap();
            let value =
                agent_computer_tools::read(&grant, &engine, &operation, &tools[0]["arguments"]);
            if operation == "read_file" {
                assert_eq!(
                    value["content"],
                    "This sample project contains a safe everyday task.\n"
                );
            } else {
                assert_eq!(value["files"][0]["path"], "README.md");
            }
            result(&token, &key, &id, tool_id, value).await.unwrap();
            assert!(pending(&token, &key, &id).await.unwrap().is_empty());
        });
    }

    #[test]
    #[ignore]
    fn local_backend_approval_and_real_mac_write_complete_one_everyday_task() {
        let read = |name: &str| std::fs::read_to_string(std::env::var(name).unwrap()).unwrap();
        let token = read("VIBYRA_AGENT_SMOKE_TOKEN_FILE");
        let key = read("VIBYRA_AGENT_SMOKE_KEY_FILE");
        let id = read("VIBYRA_AGENT_SMOKE_WORKSPACE_FILE");
        let root = PathBuf::from(std::env::var("VIBYRA_AGENT_SMOKE_PROJECT").unwrap())
            .canonicalize()
            .unwrap();
        let grant = Grant {
            id: id.clone(),
            agent_id: "smoke".into(),
            host_id: "b".repeat(64),
            account_scope: "smoke".into(),
            label: "Smoke project".into(),
            path: root.clone(),
            source_path: Some(root.clone()),
            can_write: true,
            revoked: false,
        };
        let state = tempfile::tempdir().unwrap();
        let engine = agent_computer_tools::open(&grant, state.path()).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let tools = pending(&token, &key, &id).await.unwrap();
            assert_eq!(tools.len(), 1);
            assert_eq!(tools[0]["operation"], "write_file");
            assert_eq!(tools[0]["approval"]["state"], "queued");
            let tool_id = tools[0]["id"].as_str().unwrap();
            let fingerprint = tools[0]["approval"]["fingerprint"].as_str().unwrap();
            claim(&token, &key, &id, tool_id, fingerprint)
                .await
                .unwrap();
            let mut approved = tools[0].clone();
            approved["approval"]["state"] = json!("dispatching");
            let receipt = agent_computer_tools::edit(&grant, &engine, &approved);
            assert_eq!(receipt["written"], true, "{receipt}");
            result(&token, &key, &id, tool_id, receipt).await.unwrap();
            assert!(pending(&token, &key, &id).await.unwrap().is_empty());
        });
        assert_eq!(
            std::fs::read_to_string(root.join("notes.txt")).unwrap(),
            "Approved Mac note\n"
        );
    }
}
