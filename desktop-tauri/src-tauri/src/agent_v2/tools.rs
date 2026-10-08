//! The run's manifest as the model sees it.
//!
//! The manifest lists each granted tool once per connection. A tool granted on
//! one account keeps its own name; one granted on several accounts gets a
//! distinct name per connection (`gmail_search__1a2b3c4d`) and maps back to
//! the exact `tool` + `connectionId` the broker must call.

use serde_json::{json, Value};

pub const SERVER: &str = "vibyra-broker";
const MAX_TOOLS: usize = 10;

#[derive(Clone, Debug, PartialEq)]
pub struct ExposedTool {
    /// Model-facing MCP tool name.
    pub name: String,
    pub tool: String,
    pub connection_id: String,
    pub schema_revision: String,
    pub kind: String,
    pub account: String,
    pub description: String,
    pub parameters: Value,
}

impl ExposedTool {
    /// The name Claude Code reports in `system/init.tools`.
    pub fn qualified(&self) -> String {
        format!("mcp__{SERVER}__{}", self.name)
    }

    pub fn mcp_definition(&self) -> Value {
        let schema = if self.parameters.is_object() && self.parameters.get("type").is_some() {
            self.parameters.clone()
        } else {
            json!({"type": "object", "properties": {}})
        };
        let mut description = self.description.trim().to_owned();
        if !self.account.is_empty() {
            description.push_str(&format!(" (Account: {}.)", self.account));
        }
        if self.kind == "write" {
            description.push_str(" This action waits for the person's approval before it runs.");
        }
        json!({"name": self.name, "description": description, "inputSchema": schema})
    }
}

fn clean(value: &Value, max: usize) -> Option<String> {
    value
        .as_str()
        .filter(|text| !text.is_empty() && text.len() <= max)
        .map(str::to_owned)
}

fn valid_tool(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 40
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

fn short_id(connection: &str) -> String {
    connection
        .chars()
        .filter(char::is_ascii_hexdigit)
        .take(8)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// Validates the manifest and assigns distinct model-facing names.
pub fn expose(manifest: &Value) -> Result<Vec<ExposedTool>, String> {
    let entries = manifest["tools"]
        .as_array()
        .ok_or("The task's tool manifest is missing.")?;
    if entries.len() > MAX_TOOLS {
        return Err("The task's tool manifest is too large.".into());
    }
    let mut tools = Vec::with_capacity(entries.len());
    for entry in entries {
        let tool = clean(&entry["tool"], 40)
            .filter(|name| valid_tool(name))
            .ok_or("The manifest has an invalid tool name.")?;
        let connection_id = clean(&entry["connectionId"], 36)
            .filter(|id| crate::agent_computer_access::looks_uuid(id))
            .ok_or("The manifest has an invalid connection.")?;
        tools.push(ExposedTool {
            name: tool.clone(),
            tool,
            connection_id,
            schema_revision: clean(&entry["schemaRevision"], 20)
                .ok_or("The manifest has no schema revision.")?,
            kind: clean(&entry["kind"], 10).unwrap_or_else(|| "read".into()),
            account: clean(&entry["account"], 200).unwrap_or_default(),
            description: clean(&entry["description"], 2000).unwrap_or_default(),
            parameters: entry["parameters"].clone(),
        });
    }
    let names: Vec<String> = tools.iter().map(|t| t.tool.clone()).collect();
    for tool in &mut tools {
        if names.iter().filter(|name| **name == tool.tool).count() > 1 {
            tool.name = format!("{}__{}", tool.tool, short_id(&tool.connection_id));
        }
    }
    let mut seen = std::collections::HashSet::new();
    if !tools.iter().all(|tool| seen.insert(tool.name.clone())) {
        return Err("Two granted connections share a tool name.".into());
    }
    Ok(tools)
}

/// `--allowedTools` values and the exact `system/init.tools` the gate expects.
pub fn qualified_names(tools: &[ExposedTool]) -> Vec<String> {
    tools.iter().map(ExposedTool::qualified).collect()
}

/// The only MCP server Claude Code may load: this app binary in broker mode.
pub fn mcp_config(broker_program: &str, broker_config: &str) -> Value {
    json!({"mcpServers": {SERVER: {
        "type": "stdio",
        "command": broker_program,
        "args": [crate::agent_v2::broker::FLAG],
        "env": {"VIBYRA_BROKER_CONFIG": broker_config}
    }}})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(tool: &str, connection: &str) -> Value {
        json!({"tool": tool, "connectionId": connection, "provider": "gmail", "account": "me@example.com",
            "kind": "read", "requiresApproval": false, "schemaRevision": "abc123abc123",
            "description": "Search mail", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}}})
    }

    const A: &str = "1a2b3c4d-0000-4000-8000-000000000001";
    const B: &str = "9f8e7d6c-0000-4000-8000-000000000002";

    #[test]
    fn single_connection_tools_keep_their_names() {
        let tools =
            expose(&json!({"tools": [entry("gmail_search", A), entry("gmail_read", A)]})).unwrap();
        assert_eq!(
            qualified_names(&tools),
            [
                "mcp__vibyra-broker__gmail_search",
                "mcp__vibyra-broker__gmail_read"
            ]
        );
    }

    #[test]
    fn a_tool_on_two_connections_gets_distinct_names_that_map_back() {
        let tools = expose(&json!({"tools": [entry("gmail_search", A), entry("gmail_search", B)]}))
            .unwrap();
        assert_eq!(tools[0].name, "gmail_search__1a2b3c4d");
        assert_eq!(tools[1].name, "gmail_search__9f8e7d6c");
        assert_eq!(
            (tools[1].tool.as_str(), tools[1].connection_id.as_str()),
            ("gmail_search", B)
        );
    }

    #[test]
    fn malformed_manifests_are_refused() {
        assert!(expose(&json!({})).is_err());
        assert!(expose(&json!({"tools": [entry("Gmail Search", A)]})).is_err());
        assert!(expose(&json!({"tools": [entry("gmail_search", "not-a-uuid")]})).is_err());
        let many: Vec<_> = (0..11).map(|_| entry("gmail_search", A)).collect();
        assert!(expose(&json!({ "tools": many })).is_err());
    }
}
