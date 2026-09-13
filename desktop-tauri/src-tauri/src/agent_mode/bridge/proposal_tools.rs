use serde_json::{json, Value};

pub fn tools() -> Vec<Value> {
    vec![
        json!({"name":"propose_memory","description":"Propose a durable fact for the person to review. Never installs memory automatically.","inputSchema":{"type":"object","properties":{"body":{"type":"string"},"class":{"type":"string","enum":["fact","preference","decision","constraint","lesson"]}},"required":["body","class"],"additionalProperties":false}}),
        json!({"name":"propose_skill","description":"Propose a reusable procedure for the person to review. Cannot install or assign it.","inputSchema":{"type":"object","properties":{"name":{"type":"string"},"summary":{"type":"string"},"trigger":{"type":"string"},"procedure":{"type":"string"},"verification":{"type":"string"},"boundary":{"type":"string"}},"required":["name","summary","trigger","procedure","verification","boundary"],"additionalProperties":false}}),
    ]
}
pub fn dynamic() -> Vec<Value> {
    tools()
        .into_iter()
        .chain(crate::integrations::tools::tools())
        .map(|mut tool| {
            tool["type"] = json!("function");
            tool
        })
        .collect()
}
