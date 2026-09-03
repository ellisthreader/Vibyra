//! The event wire format, as the frontend and the database both see it.

use super::events::AgentEvent;

/// New rows are camelCase — the names the transcript reducer reads.
#[test]
fn events_serialise_with_camel_case_fields() {
    let json = serde_json::to_string(&AgentEvent::UsageUpdated {
        input_tokens: 61_604,
        output_tokens: 835,
        cost_usd: Some(0.11),
    })
    .unwrap();
    assert!(json.contains("\"inputTokens\":61604"), "{json}");
    assert!(json.contains("\"costUsd\":0.11"), "{json}");
    let json = serde_json::to_string(&AgentEvent::ToolOutput {
        call_id: "toolu_1".into(),
        tool: "Bash".into(),
        output: "ok".into(),
        exit_code: Some(0),
        failed: false,
    })
    .unwrap();
    assert!(json.contains("\"callId\":\"toolu_1\""), "{json}");
    assert!(json.contains("\"exitCode\":0"), "{json}");
    assert!(!json.contains("call_id"), "{json}");
}

/// Rows stored before the rename were snake_case, and they still read.
#[test]
fn legacy_snake_case_rows_still_deserialise() {
    let legacy =
        r#"{"kind":"tool.requested","call_id":"toolu_9","tool":"Write","summary":"/w/a.rs"}"#;
    let event: AgentEvent = serde_json::from_str(legacy).unwrap();
    assert!(matches!(event, AgentEvent::ToolRequested { call_id, .. } if call_id == "toolu_9"));
    let legacy = r#"{"kind":"usage.updated","input_tokens":1,"output_tokens":2,"cost_usd":null}"#;
    let event: AgentEvent = serde_json::from_str(legacy).unwrap();
    assert_eq!(
        event,
        AgentEvent::UsageUpdated {
            input_tokens: 1,
            output_tokens: 2,
            cost_usd: None
        }
    );
}
