//! JSON-RPC pieces shared by the connection and the handshake.

use super::error::McpError;
use serde_json::{json, Value};

/// Which dialect the server speaks, decided by the handshake.
#[derive(Clone, Debug, PartialEq)]
pub enum Era {
    Pending,
    Modern(String),
    Legacy(String),
}

pub const META_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
pub const META_CAPS: &str = "io.modelcontextprotocol/clientCapabilities";
pub const META_INFO: &str = "io.modelcontextprotocol/clientInfo";

/// Modern requests carry their own version and capabilities in `_meta`.
pub fn with_meta(version: &str, mut params: Value) -> Value {
    if let Some(object) = params.as_object_mut() {
        let meta = object.entry("_meta").or_insert_with(|| json!({}));
        meta[META_VERSION] = json!(version);
        meta[META_CAPS] = json!({});
        meta[META_INFO] = json!({"name": "vibyra", "version": env!("CARGO_PKG_VERSION")});
    }
    params
}

/// `result` of a response, or the server's error.
pub fn outcome(message: &Value) -> Result<Value, McpError> {
    if let Some(error) = message.get("error") {
        return Err(McpError::Rpc {
            code: error["code"].as_i64().unwrap_or(0),
            message: super::redact::head(error["message"].as_str().unwrap_or("error"), 300)
                .to_owned(),
        });
    }
    Ok(message["result"].clone())
}

/// The answer to a request a server sent us: `ping` is fine, nothing else is offered.
pub fn decline(request: &Value) -> Value {
    if request["method"] == "ping" {
        return json!({"jsonrpc": "2.0", "id": request["id"], "result": {}});
    }
    json!({"jsonrpc": "2.0", "id": request["id"],
        "error": {"code": -32601, "message": "Vibyra does not offer this to servers."}})
}
