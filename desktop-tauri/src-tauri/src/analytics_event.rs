//! Allowlisted Desktop event names and bounded categorical payloads.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Deserialize)]
pub enum Event {
    #[serde(rename = "desktop_app_opened")]
    AppOpened,
    #[serde(rename = "desktop_project_created")]
    ProjectCreated,
    #[serde(rename = "desktop_project_opened")]
    ProjectOpened,
    #[serde(rename = "desktop_terminal_started")]
    TerminalStarted,
    #[serde(rename = "desktop_prompt_submitted")]
    PromptSubmitted,
    #[serde(rename = "desktop_engagement_interval")]
    EngagementInterval,
}

fn safe_value(key: &str, value: &Value) -> bool {
    if key == "seconds" {
        return value
            .as_u64()
            .is_some_and(|seconds| (1..=60).contains(&seconds));
    }
    let Some(text) = value.as_str() else {
        return false;
    };
    let limit = if key == "model" { 80 } else { 48 };
    !text.is_empty()
        && text.len() <= limit
        && text.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/' | b'+')
        })
}

fn public_model_shape(model: &str) -> bool {
    let model = model.strip_prefix("openrouter/").unwrap_or(model);
    let bare = model.rsplit('/').next().unwrap_or(model);
    const PREFIXES: &[&str] = &[
        "gpt-",
        "claude-",
        "gemini-",
        "grok-",
        "qwen",
        "deepseek-",
        "mistral-",
        "llama-",
        "phi-",
        "command-",
        "sonar-",
        "kimi-",
        "glm-",
        "nova-",
        "jamba-",
        "granite-",
        "nemotron-",
        "minimax-",
        "hunyuan-",
        "ernie-",
        "seed-",
        "mimo-",
        "compound",
        "firefunction-",
        "lfm-",
        "hermes-",
        "auto",
    ];
    PREFIXES.iter().any(|prefix| bare.starts_with(prefix))
        && model.matches('/').count() <= 1
        && !model.contains(':')
        && !model.contains('_')
}

fn normalize_dimensions(properties: &mut BTreeMap<String, Value>) {
    const PROVIDERS: &[&str] = &[
        "shell", "ssh", "claude", "codex", "gemini", "aider", "opencode", "qwen", "copilot", "amp",
        "crush", "continue", "other",
    ];
    if let Some(provider) = properties.get("provider").and_then(Value::as_str) {
        if !PROVIDERS.contains(&provider) {
            properties.insert("provider".into(), json!("other"));
            properties.remove("model");
        }
    }
    if let Some(model) = properties.get("model").and_then(Value::as_str) {
        if !public_model_shape(model) {
            properties.remove("model");
        } else if let Some(stripped) = model.strip_prefix("openrouter/") {
            properties.insert("model".into(), json!(stripped));
        }
    }
}

pub fn payload(
    event: Event,
    mut properties: BTreeMap<String, Value>,
    event_id: Option<String>,
    app_version: &str,
) -> Result<Value, String> {
    let (name, keys): (&str, &[&str]) = match event {
        Event::AppOpened => ("desktop_app_opened", &[]),
        Event::ProjectCreated => ("desktop_project_created", &[]),
        Event::ProjectOpened => ("desktop_project_opened", &[]),
        Event::TerminalStarted => ("desktop_terminal_started", &["provider", "model"]),
        Event::PromptSubmitted => ("desktop_prompt_submitted", &["provider", "model"]),
        Event::EngagementInterval => ("desktop_engagement_interval", &["seconds"]),
    };
    normalize_dimensions(&mut properties);
    if properties
        .iter()
        .any(|(key, value)| !keys.contains(&key.as_str()) || !safe_value(key, value))
    {
        return Err("Unsupported analytics metadata.".into());
    }
    let id = match event_id {
        Some(value) => Uuid::parse_str(&value).map_err(|_| "Invalid analytics event ID.")?,
        None => Uuid::new_v4(),
    };
    let properties = if name == "desktop_app_opened" {
        json!({"platform": std::env::consts::OS, "app_version": app_version})
    } else {
        serde_json::to_value(properties).map_err(|_| "Invalid metadata.")?
    };
    Ok(
        json!({"event":name, "surface":"desktop", "event_id":id.to_string(),
        "occurred_at":chrono::Utc::now().to_rfc3339(), "properties":properties}),
    )
}

#[cfg(test)]
mod tests {
    use super::{payload, Event};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn rejects_private_metadata_and_invalid_duration() {
        for key in ["prompt", "path", "project_name", "url", "email"] {
            assert!(payload(
                Event::PromptSubmitted,
                BTreeMap::from([(key.into(), json!("secret"))]),
                None,
                "0.7.9"
            )
            .is_err());
        }
        assert!(payload(
            Event::EngagementInterval,
            BTreeMap::from([("seconds".into(), json!(61))]),
            None,
            "0.7.9"
        )
        .is_err());
        assert!(payload(
            Event::EngagementInterval,
            BTreeMap::from([("seconds".into(), json!(20))]),
            None,
            "0.7.9"
        )
        .is_ok());
    }

    #[test]
    fn accepted_event_has_stable_id_and_no_content() {
        let id = "123e4567-e89b-42d3-a456-426614174000".to_owned();
        let value = payload(
            Event::TerminalStarted,
            BTreeMap::from([("provider".into(), json!("codex"))]),
            Some(id.clone()),
            "0.7.9",
        )
        .unwrap();
        assert_eq!(value["event_id"], id);
        assert_eq!(value["properties"]["provider"], "codex");
        assert!(value["properties"].get("path").is_none());
    }

    #[test]
    fn custom_agent_name_cannot_become_a_dimension() {
        let value = payload(
            Event::TerminalStarted,
            BTreeMap::from([
                ("provider".into(), json!("private_project_name")),
                ("model".into(), json!("mysecret")),
            ]),
            None,
            "0.7.9",
        )
        .unwrap();
        assert_eq!(value["properties"]["provider"], "other");
        assert!(value["properties"].get("model").is_none());
    }
}
