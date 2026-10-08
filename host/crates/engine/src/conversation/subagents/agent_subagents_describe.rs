//! One short line for what a Claude subagent is doing, from its latest tool call.

use serde_json::Value;

use super::agent_subagents_scan::EDIT_TOOLS;

fn base(path: &str) -> &str {
    // Either separator, so a Windows path shows only its file name too.
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// One short line for the tool a Claude subagent called most recently.
pub(super) fn describe(name: &str, input: &Value) -> String {
    let file = input["file_path"]
        .as_str()
        .or(input["notebook_path"].as_str())
        .map(base);
    match (name, file) {
        ("Bash", _) => input["description"]
            .as_str()
            .unwrap_or("Running a command")
            .to_owned(),
        (_, Some(file)) if EDIT_TOOLS.contains(&name) => format!("Editing {file}"),
        ("Read", Some(file)) => format!("Reading {file}"),
        ("Grep" | "Glob", _) => "Searching the code".into(),
        ("WebFetch" | "WebSearch", _) => "Searching the web".into(),
        ("Agent" | "Task", _) => "Starting a subagent".into(),
        _ => name.to_owned(),
    }
}

pub(super) fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find("</")? + start;
    Some(&text[start..end])
}
