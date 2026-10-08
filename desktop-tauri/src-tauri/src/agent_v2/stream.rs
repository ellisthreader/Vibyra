//! Claude Code `--output-format stream-json` lines, reduced to what the runner
//! acts on (adapter doc "Event mapping").

use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct Init {
    pub tools: Vec<String>,
    /// `(name, status)` for every MCP server Claude Code loaded.
    pub mcp_servers: Vec<(String, String)>,
    pub api_key_source: String,
    pub model: String,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Line {
    ControlResponse {
        id: String,
        ok: bool,
        body: Value,
        error: String,
    },
    /// Claude asking the host something (e.g. `can_use_tool`); always denied.
    ControlRequest {
        id: String,
        subtype: String,
    },
    Init(Init),
    TextDelta(String),
    /// Complete text of one assistant message's text blocks.
    AssistantText(String),
    ToolUse {
        id: String,
        name: String,
    },
    RateLimit {
        status: String,
        resets_at: Option<i64>,
    },
    Result {
        is_error: bool,
        subtype: String,
        text: String,
    },
    Other,
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

pub fn parse(line: &str) -> Line {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Line::Other;
    };
    match (value["type"].as_str(), value["subtype"].as_str()) {
        (Some("control_response"), _) => {
            let response = &value["response"];
            Line::ControlResponse {
                id: text(&response["request_id"]),
                ok: response["subtype"] == "success",
                body: response["response"].clone(),
                error: text(&response["error"]),
            }
        }
        (Some("control_request"), _) => Line::ControlRequest {
            id: text(&value["request_id"]),
            subtype: text(&value["request"]["subtype"]),
        },
        (Some("system"), Some("init")) => Line::Init(Init {
            tools: strings(&value["tools"]),
            mcp_servers: value["mcp_servers"]
                .as_array()
                .map(|servers| {
                    servers
                        .iter()
                        .map(|s| (text(&s["name"]), text(&s["status"])))
                        .collect()
                })
                .unwrap_or_default(),
            api_key_source: text(&value["apiKeySource"]),
            model: text(&value["model"]),
            version: text(&value["claude_code_version"]),
        }),
        (Some("stream_event"), _) => {
            let event = &value["event"];
            if event["type"] == "content_block_delta" && event["delta"]["type"] == "text_delta" {
                Line::TextDelta(text(&event["delta"]["text"]))
            } else {
                Line::Other
            }
        }
        (Some("assistant"), _) => {
            let blocks = value["message"]["content"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            if let Some(tool) = blocks.iter().find(|b| b["type"] == "tool_use") {
                return Line::ToolUse {
                    id: text(&tool["id"]),
                    name: text(&tool["name"]),
                };
            }
            let joined: String = blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect();
            Line::AssistantText(joined)
        }
        (Some("rate_limit_event"), _) => {
            let info = &value["rate_limit_info"];
            Line::RateLimit {
                status: text(&info["status"]),
                resets_at: info["resetsAt"].as_i64(),
            }
        }
        (Some("result"), subtype) => {
            let is_error = value["is_error"].as_bool().unwrap_or(false)
                || subtype.is_some_and(|s| s.starts_with("error"));
            let mut message = text(&value["result"]);
            if message.is_empty() {
                message = strings(&value["errors"]).join("\n");
            }
            Line::Result {
                is_error,
                subtype: subtype.unwrap_or_default().to_owned(),
                text: message,
            }
        }
        _ => Line::Other,
    }
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

/// Why a turn ended badly, as a contract `fail` code plus a readable reason.
pub fn classify_failure(subtype: &str, text: &str, rate_limited: bool) -> (&'static str, String) {
    let lower = text.to_ascii_lowercase();
    let reason = if text.trim().is_empty() {
        "Claude Code could not complete this task.".to_owned()
    } else {
        text.chars().take(400).collect()
    };
    let any = |needles: &[&str]| needles.iter().any(|n| lower.contains(n));
    if rate_limited
        || any(&[
            "usage limit",
            "rate limit",
            "rate_limit",
            "limit reached",
            "429",
        ])
    {
        ("limits", reason)
    } else if any(&[
        "/login",
        "log in",
        "login",
        "authenticat",
        "oauth",
        "401",
        "unauthorized",
        "credential",
        "api key",
    ]) {
        ("provider_signin", reason)
    } else if subtype == "error_max_turns" {
        ("step_limit", reason)
    } else {
        ("provider_error", reason)
    }
}

#[cfg(test)]
#[path = "stream_tests.rs"]
mod tests;
