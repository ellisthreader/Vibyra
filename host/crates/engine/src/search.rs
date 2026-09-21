use crate::{state::Project, text};
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};

/// A grep-like read over a project: `list_files` only shows names, and a vault
/// of notes is a filing cabinet you have to already know the answer to open
/// without this. Bounded on every axis a hostile or merely enormous project
/// could otherwise blow up: files scanned, matches returned, and total bytes -
/// cut off is reported, never silently dropped, the same honesty `Nodes`
/// applies to a Figma tree.
const MAX_MATCHES: usize = 200;
const MAX_BYTES: usize = 20_000;
const MAX_FILES_SCANNED: usize = 5_000;
const MAX_FILE_SIZE: u64 = 1_000_000;
const MAX_DEPTH: usize = 16;
const SKIP: [&str; 4] = [".git", ".env", "node_modules", ".DS_Store"];

pub(crate) fn search(project: &Project, params: &Value) -> Result<Value, String> {
    let query = text(params, "query")?;
    if query.trim().is_empty() || query.chars().count() > 200 {
        return Err("search text must be 1-200 characters".into());
    }
    let needle = query.to_lowercase();
    let mut state = Walk {
        needle: &needle,
        matches: Vec::new(),
        truncated: false,
        scanned: 0,
        bytes: 0,
    };
    state.walk(&project.directory, Path::new(""), 0);
    Ok(
        json!({"query": query, "matches": state.matches, "truncated": state.truncated,
        "coverage": if state.truncated { "Cut off by file count, match count or size; narrow the query or search a subfolder." }
            else { "Every eligible file under the project root was scanned." }}),
    )
}

struct Walk<'a> {
    needle: &'a str,
    matches: Vec<Value>,
    truncated: bool,
    scanned: usize,
    bytes: usize,
}

impl Walk<'_> {
    fn full(&self) -> bool {
        self.matches.len() >= MAX_MATCHES
            || self.bytes >= MAX_BYTES
            || self.scanned >= MAX_FILES_SCANNED
    }

    /// `dir` is always a descendant of the project root, opened through the
    /// same capability chain `files`/`read` use, so a symlink cannot walk this
    /// search outside the project regardless of what it points to.
    fn walk(&mut self, dir: &cap_std::fs::Dir, prefix: &Path, depth: usize) {
        if self.full() || depth > MAX_DEPTH {
            self.truncated = true;
            return;
        }
        let Ok(entries) = dir.entries() else { return };
        for entry in entries {
            if self.full() {
                self.truncated = true;
                return;
            }
            let Ok(entry) = entry else { continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if SKIP.contains(&name.as_str()) {
                continue;
            }
            let path = if prefix.as_os_str().is_empty() {
                PathBuf::from(&name)
            } else {
                prefix.join(&name)
            };
            self.scanned += 1;
            let Ok(metadata) = dir.metadata(&name) else {
                continue;
            };
            if metadata.is_dir() {
                if let Ok(sub) = dir.open_dir(&name) {
                    self.walk(&sub, &path, depth + 1);
                }
                continue;
            }
            if !metadata.is_file() || metadata.len() > MAX_FILE_SIZE {
                continue;
            }
            self.scan_file(dir, &name, &path);
        }
    }

    fn scan_file(&mut self, dir: &cap_std::fs::Dir, name: &str, path: &Path) {
        let Ok(mut file) = dir.open(name) else { return };
        let mut bytes = Vec::new();
        if file.read_to_end(&mut bytes).is_err() {
            return;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            return;
        };
        for (number, line) in content.lines().enumerate() {
            if !line.to_lowercase().contains(self.needle) {
                continue;
            }
            let excerpt: String = line.trim().chars().take(240).collect();
            let item =
                json!({"path": path.to_string_lossy(), "line": number + 1, "excerpt": excerpt});
            self.bytes += serde_json::to_vec(&item).map(|v| v.len()).unwrap_or(0);
            self.matches.push(item);
            if self.full() {
                return;
            }
        }
    }
}
