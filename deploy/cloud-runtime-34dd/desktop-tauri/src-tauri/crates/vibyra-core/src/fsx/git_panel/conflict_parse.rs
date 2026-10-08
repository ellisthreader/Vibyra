//! Splitting a file with merge-conflict markers into plain text and hunks.
//! Pure: no Git, no disk. Line endings are kept exactly as they were.
use super::GitResult;
use crate::fsx::ship::ShipError;
use serde::Serialize;

pub const MAX_HUNKS: usize = 500;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Segment {
    Text {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Conflict {
        ours: String,
        theirs: String,
        ours_label: String,
        theirs_label: String,
    },
}

fn incomplete() -> ShipError {
    ShipError::new(
        "The conflict markers in this file are incomplete or nested. Fix it in the editor.",
    )
}

fn marker(line: &str, symbol: char) -> Option<&str> {
    let body = line.trim_end_matches(['\n', '\r']);
    let rest = body.strip_prefix(&symbol.to_string().repeat(7))?;
    match rest.chars().next() {
        None => Some(""),
        Some(' ') => Some(rest.trim()),
        _ => None,
    }
}

#[derive(PartialEq)]
enum Part {
    Text,
    Ours,
    Base,
    Theirs,
}

pub fn parse(source: &str) -> GitResult<Vec<Segment>> {
    let mut segments = Vec::new();
    let (mut text, mut ours, mut theirs) = (String::new(), String::new(), String::new());
    let (mut ours_label, mut part) = (String::new(), Part::Text);
    for line in source.split_inclusive('\n') {
        match part {
            Part::Text => {
                if let Some(label) = marker(line, '<') {
                    if segments.len() >= MAX_HUNKS * 2 {
                        return Err(ShipError::new(
                            "This file has too many conflicts to resolve here.",
                        ));
                    }
                    if !text.is_empty() {
                        segments.push(Segment::Text {
                            text: std::mem::take(&mut text),
                        });
                    }
                    ours_label = label.chars().take(60).collect();
                    part = Part::Ours;
                } else {
                    text.push_str(line);
                }
            }
            Part::Ours | Part::Base | Part::Theirs => {
                if marker(line, '<').is_some() {
                    return Err(incomplete());
                } else if part == Part::Ours && marker(line, '|').is_some() {
                    part = Part::Base;
                } else if part != Part::Theirs && marker(line, '=').is_some_and(|r| r.is_empty()) {
                    part = Part::Theirs;
                } else if part == Part::Theirs && marker(line, '>').is_some() {
                    let label = marker(line, '>').unwrap_or("").chars().take(60).collect();
                    segments.push(Segment::Conflict {
                        ours: std::mem::take(&mut ours),
                        theirs: std::mem::take(&mut theirs),
                        ours_label: std::mem::take(&mut ours_label),
                        theirs_label: label,
                    });
                    part = Part::Text;
                } else {
                    match part {
                        Part::Ours => ours.push_str(line),
                        Part::Theirs => theirs.push_str(line),
                        _ => {} // the common ancestor (diff3) is not offered
                    }
                }
            }
        }
    }
    if part != Part::Text {
        return Err(incomplete());
    }
    if !text.is_empty() {
        segments.push(Segment::Text { text });
    }
    Ok(segments)
}

pub fn hunk_count(segments: &[Segment]) -> usize {
    segments
        .iter()
        .filter(|s| matches!(s, Segment::Conflict { .. }))
        .count()
}
