//! The menu under the menu bar item: Needs you, Working, Recent, then Show Vibyra. Each row
//! names the task, then the model and project; the model's logo sits beside it.
use crate::menu_bar_model::{agent_name, Outcome, StatusRow, StatusSnapshot, OPEN, SHOW};

/// One menu line: `id` empty for a label, `agent` picks the logo.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub id: String,
    pub label: String,
    pub enabled: bool,
    pub agent: String,
}

/// Menu lines; `None` is a separator.
pub fn lines(snap: &StatusSnapshot) -> Vec<Option<Line>> {
    let mut out = Vec::new();
    let header = |out: &mut Vec<Option<Line>>, text: &str| {
        if !out.is_empty() {
            out.push(None);
        }
        out.push(Some(Line {
            id: String::new(),
            label: text.to_string(),
            enabled: false,
            agent: String::new(),
        }));
    };
    let label = |r: &StatusRow| {
        let who = agent_name(&r.agent);
        let place = [who.unwrap_or(""), r.project.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        if place.is_empty() {
            r.title.clone()
        } else {
            format!("{}    {place}", r.title)
        }
    };
    for (name, rows) in [("Needs you", &snap.attention), ("Working", &snap.working)] {
        if rows.is_empty() {
            continue;
        }
        header(&mut out, name);
        for r in rows {
            out.push(Some(Line {
                id: format!("{OPEN}{}", r.key),
                label: label(r),
                enabled: true,
                agent: r.agent.clone(),
            }));
        }
    }
    if !snap.recent.is_empty() {
        header(&mut out, "Recent");
        for r in &snap.recent {
            let mark = if r.outcome == Outcome::Done {
                "✓"
            } else {
                "✕"
            };
            out.push(Some(Line {
                id: format!("{OPEN}{}", r.key),
                label: format!("{mark} {}", r.title),
                enabled: true,
                agent: r.agent.clone(),
            }));
        }
    }
    if out.is_empty() {
        out.push(Some(Line {
            id: String::new(),
            label: "No agents running".into(),
            enabled: false,
            agent: String::new(),
        }));
    }
    out.push(None);
    out.push(Some(Line {
        id: SHOW.into(),
        label: "Show Vibyra".into(),
        enabled: true,
        agent: String::new(),
    }));
    out
}
