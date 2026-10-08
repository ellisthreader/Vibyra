//! `tools/list` and `tools/call` over an open connection, with the catalogue and
//! the result normalised to the bounds the backend and the receipt use.

use super::conn::Conn;
use super::error::McpError;
use super::limits::{MAX_TOOLS, RESULT_TEXT_BYTES};
use super::redact::head;
use serde_json::{json, Value};
use std::time::Duration;

const MAX_PAGES: usize = 10;
const MAX_SCHEMA_BYTES: usize = 32_768;

#[derive(Clone, Debug, PartialEq)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    /// Untrusted hints: the person's own mark decides what counts as a read.
    pub read_only_hint: bool,
    pub destructive_hint: bool,
}

impl ToolDef {
    /// The catalogue entry sent to the backend: names, schemas, hints. Nothing else.
    pub fn catalogue(&self) -> Value {
        json!({"name": self.name, "description": self.description, "inputSchema": self.input_schema,
            "annotations": {"readOnlyHint": self.read_only_hint, "destructiveHint": self.destructive_hint}})
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CallResult {
    pub text: String,
    pub structured: Option<Value>,
    pub is_error: bool,
    pub truncated: bool,
}

pub fn list_tools(conn: &mut Conn, timeout: Duration) -> Result<Vec<ToolDef>, McpError> {
    let mut tools = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MAX_PAGES {
        let params = cursor
            .as_ref()
            .map_or_else(|| json!({}), |c| json!({"cursor": c}));
        let page = conn.request("tools/list", params, timeout)?;
        tools.extend(
            page["tools"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(parse_tool),
        );
        cursor = page["nextCursor"]
            .as_str()
            .filter(|c| !c.is_empty())
            .map(str::to_owned);
        if cursor.is_none() || tools.len() >= MAX_TOOLS {
            break;
        }
    }
    tools.truncate(MAX_TOOLS);
    Ok(tools)
}

fn parse_tool(raw: &Value) -> Option<ToolDef> {
    let name = raw["name"]
        .as_str()
        .filter(|n| !n.is_empty() && n.len() <= 128)?;
    let schema = raw["inputSchema"].clone();
    if !schema.is_object() || schema.to_string().len() > MAX_SCHEMA_BYTES {
        return None;
    }
    let description = raw["description"]
        .as_str()
        .or(raw["title"].as_str())
        .unwrap_or_default();
    Some(ToolDef {
        name: name.to_owned(),
        description: head(description.trim(), 1000).to_owned(),
        input_schema: schema,
        read_only_hint: raw["annotations"]["readOnlyHint"] == true,
        destructive_hint: raw["annotations"]["destructiveHint"] == true,
    })
}

pub fn call_tool(
    conn: &mut Conn,
    name: &str,
    arguments: &Value,
    timeout: Duration,
) -> Result<CallResult, McpError> {
    let result = conn.request(
        "tools/call",
        json!({"name": name, "arguments": arguments}),
        timeout,
    )?;
    if result["resultType"] == "input_required" {
        return Err(McpError::Unsupported(
            "This tool asked for more input, which Vibyra does not provide to servers.".into(),
        ));
    }
    let mut parts = Vec::new();
    for block in result["content"].as_array().into_iter().flatten() {
        match block["type"].as_str() {
            Some("text") => parts.push(block["text"].as_str().unwrap_or_default().to_owned()),
            Some(other) => parts.push(format!("[{other} content omitted]")),
            None => {}
        }
    }
    let joined = conn.hide(&parts.join("\n"));
    let mut truncated = joined.len() > RESULT_TEXT_BYTES;
    let text = head(&joined, RESULT_TEXT_BYTES).to_owned();
    let structured = match result.get("structuredContent").filter(|v| !v.is_null()) {
        Some(value) if value.to_string().len() <= RESULT_TEXT_BYTES => Some(value.clone()),
        Some(_) => {
            truncated = true;
            None
        }
        None => None,
    };
    Ok(CallResult {
        text,
        structured,
        is_error: result["isError"] == true,
        truncated,
    })
}
