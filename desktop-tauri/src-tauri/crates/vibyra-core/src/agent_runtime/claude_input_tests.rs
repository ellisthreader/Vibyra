//! What the transcript shows for a Claude tool call and its result.

use super::*;
use crate::agent_model::Engine;

/// The transcript shows what a tool was asked to do, not the JSON it was
/// asked with: a Bash call is its command, a file tool is its path.
#[test]
fn claude_tool_calls_are_summarised_by_their_human_field() {
    let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"rm -f ./scratch.txt","description":"clean up"}},{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"/w/a.rs","content":"fn main() {}"}},{"type":"tool_use","id":"t3","name":"Mystery","input":{"knob":3}}]}}"#;
    let events = adapter::normalize(Engine::Claude, line);
    let summaries: Vec<String> = events
        .iter()
        .filter_map(|event| match event {
            AgentEvent::ToolRequested { summary, .. } => Some(summary.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(
        summaries,
        ["rm -f ./scratch.txt", "/w/a.rs", r#"{"knob":3}"#]
    );
}

/// A tool result that comes back as content blocks shows the blocks' text.
#[test]
fn claude_block_tool_results_show_their_text() {
    let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"done"},{"type":"text","text":"exit 0"}]}]}}"#;
    let events = adapter::normalize(Engine::Claude, line);
    assert!(
        matches!(&events[0], AgentEvent::ToolOutput { output, .. } if output == "done\nexit 0")
    );
}
