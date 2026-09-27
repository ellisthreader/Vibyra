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
    #[serde(rename = "desktop_preview_opened")]
    PreviewOpened,
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

fn backend_model_shape(model: &str) -> bool {
    if model.len() > 80 || model.contains("..") || model.starts_with('/') {
        return false;
    }
    let mut parts = model.split('/');
    let valid_part = |part: &str| {
        (1..=40).contains(&part.len())
            && part.as_bytes()[0].is_ascii_alphanumeric()
            && part.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-')
            })
    };
    let first = parts.next().is_some_and(valid_part);
    let second = parts.next().is_none_or(valid_part);
    first && second && parts.next().is_none()
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
        && backend_model_shape(model)
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
        Event::ProjectCreated => ("desktop_project_created", &["project_kind"]),
        Event::ProjectOpened => ("desktop_project_opened", &[]),
        Event::PreviewOpened => ("desktop_preview_opened", &[]),
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
