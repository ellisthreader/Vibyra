//! A bounded page of commits for the list and its lane graph. Lanes are drawn
//! by the renderer from `parents`; this only reads.
use super::GitResult;
use crate::fsx::ship::git::{git, text};
use serde::Serialize;
use std::path::Path;

/// Commits per page, and how deep a person can page (the list is a glance, not an archive).
pub const MAX_PAGE: usize = 200;
const MAX_SKIP: usize = 5_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub time_ms: u64,
    /// Branch, tag and HEAD names pointing here (Git's `%D`).
    pub refs: Vec<String>,
    pub subject: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub commits: Vec<Commit>,
    /// More commits exist past this page (and inside the depth limit).
    pub more: bool,
}

fn clip(text: &str, max: usize) -> String {
    text.chars().filter(|c| !c.is_control()).take(max).collect()
}

pub fn history(root: &Path, limit: usize, skip: usize) -> GitResult<History> {
    let limit = limit.clamp(1, MAX_PAGE);
    if text(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Ok(History::default());
    }
    let count = format!("--max-count={}", limit + 1);
    let skipped = format!("--skip={}", skip.min(MAX_SKIP));
    let out = git(
        root,
        &[
            "log",
            "--topo-order",
            "--no-show-signature",
            "-z",
            &count,
            &skipped,
            "--format=%H%x1f%P%x1f%an%x1f%ct%x1f%D%x1f%s",
            "--branches",
            "--remotes",
            "--tags",
            "HEAD",
        ],
    )?;
    let mut commits: Vec<Commit> = String::from_utf8_lossy(&out)
        .split('\0')
        .filter_map(parse)
        .collect();
    let more = commits.len() > limit && skip + limit < MAX_SKIP;
    commits.truncate(limit);
    Ok(History { commits, more })
}

fn parse(record: &str) -> Option<Commit> {
    let mut fields = record.trim_start_matches('\n').split('\u{1f}');
    let hash = fields.next().filter(|h| h.len() >= 40)?.to_string();
    let parents = fields
        .next()?
        .split_whitespace()
        .map(str::to_string)
        .collect();
    let author = clip(fields.next()?, 80);
    let seconds: u64 = fields.next()?.parse().unwrap_or(0);
    let refs = fields
        .next()?
        .split(", ")
        .map(|name| clip(name, 80))
        .filter(|name| !name.is_empty())
        .collect();
    Some(Commit {
        hash,
        parents,
        author,
        time_ms: seconds * 1000,
        refs,
        subject: clip(fields.next()?, 200),
    })
}
