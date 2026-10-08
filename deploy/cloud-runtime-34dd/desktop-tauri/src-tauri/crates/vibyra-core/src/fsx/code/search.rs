//! Project-wide search: a literal query over the files Git lists (or a bounded
//! walk outside Git), so ignored folders and build output stay out. Bounded in
//! files, bytes, matches and time; binary, oversized and linked files are
//! skipped, and a link is never followed.

use std::io::Read;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::links::{open_no_follow, LinkGuard};
use super::matcher::{Matcher, SearchOptions};
use super::search_lines::{scan_text, SearchLine};
use super::sha256_hex;
use crate::CoreResult;

pub const MAX_MATCHES: usize = 1_000;
/// Larger files are not searched.
pub const MAX_SEARCH_FILE_BYTES: u64 = 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const TIME_LIMIT: Duration = Duration::from_secs(5);
const BINARY_PROBE: usize = 8192;

#[derive(Debug, Clone, Copy)]
pub(super) struct Limits {
    pub time: Duration,
    pub bytes: u64,
    pub matches: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            time: TIME_LIMIT,
            bytes: MAX_TOTAL_BYTES,
            matches: MAX_MATCHES,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFile {
    pub rel_path: String,
    /// SHA-256 of the file as searched; a replace must quote it back.
    pub hash: String,
    pub size: u64,
    pub count: usize,
    pub lines: Vec<SearchLine>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchReport {
    pub files: Vec<SearchFile>,
    pub matches: usize,
    pub scanned: usize,
    /// "matches", "time" or "bytes" when the search stopped early.
    pub truncated: Option<&'static str>,
    pub skipped_large: usize,
    pub skipped_binary: usize,
}

/// Every searchable file under `root`, as (relative path, size), in path order.
fn listed_files(root: &Path) -> CoreResult<Vec<(String, u64)>> {
    let index = super::index::build_index(root, &AtomicBool::new(false))?;
    let mut paths: Vec<String> = Vec::with_capacity(index.names.len());
    let mut files = Vec::new();
    for at in 0..index.names.len() {
        let parent = index.parents[at];
        let path = if at == 0 {
            String::new()
        } else if parent <= 0 {
            index.names[at].clone()
        } else {
            format!("{}/{}", paths[parent as usize], index.names[at])
        };
        if index.kinds[at] == 0 {
            files.push((path.clone(), index.sizes[at]));
        }
        paths.push(path);
    }
    files.sort();
    Ok(files)
}

enum Fetched {
    /// Not a plain file, or gone: left out without a count.
    Skip,
    Large,
    Data(Vec<u8>),
}

fn read_text(guard: &mut LinkGuard, rel: &str) -> Fetched {
    let Ok(path) = guard.path_of(Path::new(rel)) else {
        return Fetched::Skip;
    };
    match std::fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_file() && meta.len() > MAX_SEARCH_FILE_BYTES => return Fetched::Large,
        Ok(meta) if meta.is_file() => {}
        _ => return Fetched::Skip,
    }
    let mut bytes = Vec::new();
    let read = open_no_follow(&path)
        .and_then(|file| file.take(MAX_SEARCH_FILE_BYTES + 1).read_to_end(&mut bytes));
    match read {
        Ok(_) if bytes.len() as u64 > MAX_SEARCH_FILE_BYTES => Fetched::Large,
        Ok(_) => Fetched::Data(bytes),
        Err(_) => Fetched::Skip,
    }
}

pub fn search(root: &Path, options: &SearchOptions) -> CoreResult<SearchReport> {
    search_with(root, options, Limits::default())
}

pub(super) fn search_with(
    root: &Path,
    options: &SearchOptions,
    limits: Limits,
) -> CoreResult<SearchReport> {
    let matcher = Matcher::new(options)?;
    let root = root.canonicalize()?;
    let started = Instant::now();
    let mut guard = LinkGuard::new(&root);
    let (mut report, mut bytes) = (SearchReport::default(), 0u64);
    for (rel, size) in listed_files(&root)? {
        if started.elapsed() > limits.time {
            report.truncated = Some("time");
            break;
        }
        if size > MAX_SEARCH_FILE_BYTES {
            report.skipped_large += 1;
            continue;
        }
        if bytes + size > limits.bytes {
            report.truncated = Some("bytes");
            break;
        }
        let data = match read_text(&mut guard, &rel) {
            Fetched::Skip => continue,
            Fetched::Large => {
                report.skipped_large += 1;
                continue;
            }
            Fetched::Data(data) => data,
        };
        bytes += data.len() as u64;
        report.scanned += 1;
        if data[..data.len().min(BINARY_PROBE)].contains(&0) {
            report.skipped_binary += 1;
            continue;
        }
        let Ok(text) = std::str::from_utf8(&data) else {
            report.skipped_binary += 1;
            continue;
        };
        let room = limits.matches - report.matches;
        let (lines, count) = scan_text(&matcher, options.replacement.as_deref(), text, room);
        if count > 0 {
            report.matches += count;
            report.files.push(SearchFile {
                rel_path: rel,
                hash: sha256_hex(&data),
                size: data.len() as u64,
                count,
                lines,
            });
        }
        if report.matches >= limits.matches {
            report.truncated = Some("matches");
            break;
        }
    }
    Ok(report)
}

#[cfg(test)]
#[path = "search_tests.rs"]
mod tests;
