//! Codex rollout lines turned into subagent activity: timestamps, the current
//! step in plain words, and what each event adds to an `Activity`.

use serde_json::Value;

use super::agent_subagents_scan::Activity;

const PATCH_MARKS: [&str; 3] = ["*** Add File: ", "*** Update File: ", "*** Delete File: "];

/// Milliseconds since 2000 for an RFC 3339 UTC stamp such as
/// `2026-09-27T22:01:36.564Z`; only differences between stamps matter.
pub(super) fn millis(stamp: &str) -> Option<i64> {
    let field = |range: std::ops::Range<usize>| stamp.get(range)?.parse::<i64>().ok();
    let (year, month, day) = (field(0..4)?, field(5..7)?, field(8..10)?);
    let (hour, minute, second) = (field(11..13)?, field(14..16)?, field(17..19)?);
    let fraction = stamp
        .get(20..23)
        .and_then(|ms| ms.parse::<i64>().ok())
        .unwrap_or(0);
    // Days from a March-based civil calendar, valid for any Gregorian date.
    let (y, m) = if month <= 2 {
        (year - 1, month + 9)
    } else {
        (year, month - 3)
    };
    let days = 365 * y + y / 4 - y / 100 + y / 400 + (153 * m + 2) / 5 + day - 730_425;
    Some(((days * 24 + hour) * 60 + minute) * 60_000 + second * 1_000 + fraction)
}

/// One short line for a Codex tool call: the shell command it runs, if any.
pub(super) fn codex_doing(payload: &Value) -> String {
    let name = payload["name"].as_str().unwrap_or("tool");
    let text = payload["input"]
        .as_str()
        .or(payload["arguments"].as_str())
        .unwrap_or_default();
    if name == "apply_patch" || text.contains("*** Begin Patch") {
        return "Editing files".into();
    }
    let command = ["\"cmd\":\"", "cmd:\"", "\"command\":\""]
        .iter()
        .find_map(|mark| {
            let rest = &text[text.find(mark)? + mark.len()..];
            Some(rest[..rest.find('"').unwrap_or(rest.len())].trim())
        });
    match command.filter(|command| !command.is_empty()) {
        Some(command) => format!("Running {}", command.chars().take(80).collect::<String>()),
        None => name.to_owned(),
    }
}

impl Activity {
    pub(super) fn codex_event(&mut self, text: &str, event: &Value) {
        let payload = &event["payload"];
        match (event["type"].as_str(), payload["type"].as_str()) {
            // A forked child also carries its parent's first line; keep its own.
            (Some("session_meta"), _) if self.head.is_none() => self.head = Some(payload.clone()),
            (Some("turn_context"), _) => self.model = payload["model"].as_str().map(str::to_owned),
            (_, Some("task_started")) => self.working = true,
            (_, Some("task_complete" | "turn_aborted")) => self.working = false,
            _ => {}
        }
        // A fork copies the parent's history in its first moment; only later
        // tool calls are this subagent's own edits.
        let call = matches!(
            payload["type"].as_str(),
            Some("custom_tool_call" | "function_call")
        );
        let born = self
            .first_at
            .as_deref()
            .and_then(millis)
            .unwrap_or(i64::MAX);
        let at = event["timestamp"]
            .as_str()
            .and_then(millis)
            .unwrap_or(i64::MIN);
        if !call || at < born.saturating_add(1_000) {
            return;
        }
        self.doing = Some(codex_doing(payload));
        for mark in PATCH_MARKS {
            for (at, _) in text.match_indices(mark) {
                let rest = &text[at + mark.len()..];
                let end = rest.find("\\n").or(rest.find('"')).unwrap_or(rest.len());
                self.edited(&rest[..end]);
            }
        }
    }
}
