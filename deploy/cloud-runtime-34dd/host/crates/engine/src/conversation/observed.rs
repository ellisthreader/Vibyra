use serde_json::{json, Value};

/// Only provider-exposed summaries and observed operation fields enter presentation.
pub(super) fn detail(raw: &Value) -> String {
    let value = match raw["type"].as_str().unwrap_or("") {
        "reasoning" => {
            return raw["summary"]
                .as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("\n\n")
                })
                .unwrap_or_default()
        }
        "commandExecution" => {
            return format!(
                "{}\n{}",
                raw["command"].as_str().unwrap_or(""),
                raw["aggregatedOutput"].as_str().unwrap_or("")
            )
        }
        "fileChange" => raw["changes"].clone(),
        "mcpToolCall" | "dynamicToolCall" => json!({"server":raw["server"],"tool":raw["tool"],
            "arguments":redact(&raw["arguments"]),"result":redact(&raw["result"]),
            "content":redact(&raw["contentItems"]),"error":raw["error"]}),
        "webSearch" => json!({"action":raw["action"],"query":raw["query"]}),
        "imageView" => json!({"path":raw["path"]}),
        "plan" => return raw["text"].as_str().unwrap_or("").into(),
        _ => return String::new(),
    };
    serde_json::to_string_pretty(&value).unwrap_or_default()
}
pub(super) fn redact(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, value)| {
                    let lower = key.to_ascii_lowercase();
                    let secret = [
                        "password",
                        "secret",
                        "token",
                        "authorization",
                        "api_key",
                        "apikey",
                        "cookie",
                    ]
                    .iter()
                    .any(|word| lower.contains(word));
                    (
                        key.clone(),
                        if secret {
                            json!("[redacted]")
                        } else {
                            redact(value)
                        },
                    )
                })
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.iter().map(redact).collect()),
        _ => value.clone(),
    }
}
