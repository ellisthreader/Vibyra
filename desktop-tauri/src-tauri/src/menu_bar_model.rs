//! The menu bar status model: the renderer contract and the pure rules that
//! turn it into a title, a glyph, a Dock badge and menu lines. Applied by
//! `menu_bar_status.rs`.
use serde::{Deserialize, Serialize};

use crate::menu_bar_glyph::Glyph;

pub use crate::menu_bar_lines::lines;

pub const OPEN: &str = "live-status-open-";
pub const SHOW: &str = "live-status-show";
const MAX_ROWS: usize = 6;
const MAX_RECENT: usize = 3;
/// Characters of the task title shown beside the menu bar icon.
const BAR_TITLE: usize = 22;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct StatusRow {
    /// `t:<pane>`, `c:<chat>`, `m:<teammate>` or `phone`; handed back on click.
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub project: String,
    /// `claude`, `codex`, `gemini`… for the logo; empty for an iPhone or a teammate.
    #[serde(default)]
    pub agent: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Done,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct RecentRow {
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub agent: String,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct StatusSnapshot {
    pub enabled: bool,
    pub attention: Vec<StatusRow>,
    pub working: Vec<StatusRow>,
    pub recent: Vec<RecentRow>,
}

/// Printable, single-line, bounded; never empty.
pub fn clean(text: &str, max: usize, fallback: &str) -> String {
    let line: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.is_empty() {
        return fallback.to_string();
    }
    if line.chars().count() <= max {
        return line;
    }
    let cut: String = line.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", cut.trim_end())
}

/// Keys go back to the renderer verbatim, so only a plain, short id survives.
pub fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 96
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_' | '.'))
}

/// Lower-case letters only, so it can only ever name a logo.
fn agent_id(agent: &str) -> String {
    agent
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .take(16)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// The model's plain name for the three agents with a logo.
pub fn agent_name(agent: &str) -> Option<&'static str> {
    match agent {
        "claude" => Some("Claude"),
        "codex" => Some("Codex"),
        "gemini" => Some("Gemini"),
        _ => None,
    }
}

/// Bounds and cleans what the renderer sent, so the native side never trusts it.
pub fn sanitize(mut snap: StatusSnapshot) -> StatusSnapshot {
    let row = |r: StatusRow| StatusRow {
        key: r.key,
        title: clean(&r.title, 40, "Terminal"),
        project: clean(&r.project, 28, ""),
        agent: agent_id(&r.agent),
    };
    let keep = |r: &StatusRow| valid_key(&r.key);
    snap.attention = snap
        .attention
        .into_iter()
        .filter(keep)
        .take(MAX_ROWS)
        .map(row)
        .collect();
    snap.working = snap
        .working
        .into_iter()
        .filter(keep)
        .take(MAX_ROWS)
        .map(row)
        .collect();
    snap.recent = snap
        .recent
        .into_iter()
        .filter(|r| valid_key(&r.key))
        .take(MAX_RECENT)
        .map(|r| RecentRow {
            title: clean(&r.title, 40, "Terminal"),
            agent: agent_id(&r.agent),
            ..r
        })
        .collect();
    snap
}

pub fn glyph(snap: &StatusSnapshot) -> Glyph {
    if !snap.attention.is_empty() {
        Glyph::Attention
    } else if !snap.working.is_empty() {
        Glyph::Working
    } else {
        Glyph::Idle
    }
}

/// The agent the menu bar shows: whoever needs you, else the first one working.
pub fn lead(snap: &StatusSnapshot) -> Option<&StatusRow> {
    snap.attention.first().or_else(|| snap.working.first())
}

/// Words beside the icon: who and what, only when something is happening.
pub fn title(snap: &StatusSnapshot) -> Option<String> {
    let name = |r: &StatusRow| agent_name(&r.agent).map(str::to_string);
    match (snap.attention.len(), snap.working.len()) {
        (0, 0) => None,
        (1, _) => Some(format!(
            "{} needs you",
            name(&snap.attention[0]).unwrap_or_else(|| clean(
                &snap.attention[0].title,
                BAR_TITLE,
                "Agent"
            ))
        )),
        (n, _) if n > 1 => Some(format!("{n} need you")),
        (_, n) => {
            let first = &snap.working[0];
            let task = clean(&first.title, BAR_TITLE, "Working");
            let head = match name(first) {
                Some(agent) => format!("{agent} · {task}"),
                None => task,
            };
            Some(if n > 1 {
                format!("{head} +{}", n - 1)
            } else {
                head
            })
        }
    }
}

/// The Dock badge counts only what is waiting on the person.
pub fn badge(snap: &StatusSnapshot) -> Option<i64> {
    (snap.enabled && !snap.attention.is_empty()).then_some(snap.attention.len() as i64)
}

#[cfg(test)]
#[path = "menu_bar_status_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "menu_bar_sanitize_tests.rs"]
mod sanitize_tests;
