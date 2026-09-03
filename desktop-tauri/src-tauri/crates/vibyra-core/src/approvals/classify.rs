//! Turning a provider's permission prompt into a proposed action.
//!
//! Claude Code asks Vibyra before it runs a tool it cannot allow on its own.
//! What arrives is a tool name and its raw input; what the broker needs is a
//! risk class, a target the user reads, and the exact effect. The mapping is a
//! pure function so the policy can be tested without a process on either side.
//!
//! The detail is always the tool's own input — the command, the path — never
//! the model's description of what it is about to do. The description is the
//! part an injected prompt would control.

use serde_json::Value;

use super::risk::Risk;
use super::shell_risk::bash_risk;

/// A tool call, classified.
#[derive(Debug, Clone, PartialEq)]
pub struct Classified {
    pub risk: Risk,
    /// Machine-readable, e.g. `shell.run` or `file.write`.
    pub action: String,
    /// The line people read: a path, or the head of a command.
    pub target: String,
    /// The exact effect: the whole command, or the path being written.
    pub detail: String,
}

/// Tools that only look. Reading inside a granted place is the work, not a
/// question, and the provider already confines these to its working dirs.
const READ_TOOLS: &[&str] = &[
    "Read",
    "Glob",
    "Grep",
    "LS",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
    "TodoRead",
    "Task",
    "NotebookRead",
];

const FILE_TOOLS: &[&str] = &["Edit", "Write", "MultiEdit", "NotebookEdit"];

pub fn classify(tool: &str, input: &Value) -> Classified {
    if READ_TOOLS.contains(&tool) {
        return Classified {
            risk: Risk::Read,
            action: format!("tool.{}", tool.to_lowercase()),
            target: file_target(input).unwrap_or_else(|| summarise(input)),
            detail: summarise(input),
        };
    }
    if FILE_TOOLS.contains(&tool) {
        let path = file_target(input).unwrap_or_default();
        return Classified {
            risk: Risk::Write,
            action: "file.write".into(),
            target: path.clone(),
            detail: path,
        };
    }
    if tool == "Bash" {
        let command = input
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        return Classified {
            risk: bash_risk(command),
            action: "shell.run".into(),
            target: command_head(command),
            detail: command.to_string(),
        };
    }
    // Unknown, including anything from another MCP server: the class that
    // always asks and can never be trusted away.
    Classified {
        risk: Risk::Secret,
        action: format!("tool.{tool}"),
        target: tool.to_string(),
        detail: summarise(input),
    }
}

/// The path a file tool names, whichever field it uses.
pub fn file_target(input: &Value) -> Option<String> {
    ["file_path", "notebook_path", "path"]
        .iter()
        .find_map(|key| input.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

/// The first words of a command — enough to say "git push" on a card whose
/// body carries the whole line.
fn command_head(command: &str) -> String {
    let words: Vec<&str> = command.split_whitespace().take(3).collect();
    let mut head = words.join(" ");
    if head.chars().count() > 60 {
        head = head.chars().take(57).collect::<String>() + "…";
    }
    head
}

fn summarise(input: &Value) -> String {
    let text = match input {
        Value::Object(fields) if fields.is_empty() => String::new(),
        Value::Null => String::new(),
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    };
    text.chars().take(2_000).collect()
}

/// The risk class of a handoff phrase that turned it into a decision.
///
/// The phrases are `agent_mail::guards::ESCALATION`; this says what kind of
/// consequence each names, so the card is bordered like the thing it is.
pub fn escalation_risk(phrase: &str) -> Risk {
    let lower = phrase.to_lowercase();
    if ["refund", "charge", "pay", "buy", "spend"]
        .iter()
        .any(|word| lower.contains(word))
    {
        return Risk::Spend;
    }
    if ["delete", "drop", "wipe", "remove", "force push"]
        .iter()
        .any(|word| lower.contains(word))
    {
        return Risk::Destructive;
    }
    if [
        "rotate the key",
        "grant",
        "full access",
        "skip approval",
        "without asking",
    ]
    .iter()
    .any(|word| lower.contains(word))
    {
        return Risk::Secret;
    }
    Risk::Publish
}
