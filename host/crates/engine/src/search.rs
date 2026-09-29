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
/// Text read across the whole search, so thousands of large files cannot turn
/// one query into gigabytes of reading.
const MAX_READ: usize = 64 * 1024 * 1024;
/// How much of a file is read to decide whether it could be text at all.
const HEAD: u64 = 8 * 1024;
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
        read: 0,
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
    read: usize,
}

impl Walk<'_> {
    fn full(&self) -> bool {
        self.matches.len() >= MAX_MATCHES
            || self.bytes >= MAX_BYTES
            || self.scanned >= MAX_FILES_SCANNED
            || self.read >= MAX_READ
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
            if SKIP.contains(&name.as_str()) || name.starts_with(".env.") || name == ".vibyra-agent"
            {
                continue;
            }
            let path = if prefix.as_os_str().is_empty() {
                PathBuf::from(&name)
            } else {
                prefix.join(&name)
            };
            self.scanned += 1;
            let Ok(metadata) = dir.symlink_metadata(&name) else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
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
        // Only UTF-8 text is searched. An image or build output is almost
        // always invalid from its first bytes, so those are read first and
        // the rest of the file only when they could be text.
        if file.by_ref().take(HEAD).read_to_end(&mut bytes).is_err() {
            return;
        }
        if std::str::from_utf8(&bytes).is_err_and(|e| e.error_len().is_some()) {
            return;
        }
        if file.read_to_end(&mut bytes).is_err() {
            return;
        }
        self.read += bytes.len();
        let Ok(content) = String::from_utf8(bytes) else {
            return;
        };
        let lowered = content.to_lowercase();
        for (number, line) in matching(&content, &lowered, self.needle) {
            let excerpt: String = line.trim().chars().take(240).collect();
            let item = json!({"path": path.to_string_lossy(), "line": number, "excerpt": excerpt});
            self.bytes += serde_json::to_vec(&item).map(|v| v.len()).unwrap_or(0);
            self.matches.push(item);
            if self.full() {
                return;
            }
        }
    }
}

/// The 1-based number and text of each line of `content` whose lowercase
/// holds `needle`. `lowered` is the whole file lowercased once rather than
/// each line on its own: case mapping never makes or removes a line break,
/// and a line break ends the context the final-sigma rule looks at, so its
/// lines are exactly the original lines lowercased one by one.
fn matching<'a>(
    content: &'a str,
    lowered: &'a str,
    needle: &'a str,
) -> impl Iterator<Item = (usize, &'a str)> + 'a {
    content
        .lines()
        .zip(lowered.lines())
        .enumerate()
        .filter(move |(_, (_, lower))| lower.contains(needle))
        .map(|(number, (line, _))| (number + 1, line))
}

#[cfg(test)]
mod tests {
    use super::matching;

    /// Lowering the file once finds the same lines as lowering each line.
    #[test]
    fn whole_file_lowercase_matches_line_by_line() {
        let content = "ΟΔΟΣ\r\nΣΑΣ ΟΔΟΣ.\nİstanbul\r\n\nMIXED Case\nΣ\nlast ΟΔΟΣ";
        let lowered = content.to_lowercase();
        let needles = [
            "οδος",
            "οδοσ",
            "σας",
            "i\u{307}stanbul",
            "mixed case",
            "σ",
            "ς",
        ];
        for needle in needles {
            let expected: Vec<_> = content
                .lines()
                .enumerate()
                .filter(|(_, line)| line.to_lowercase().contains(needle))
                .map(|(number, line)| (number + 1, line))
                .collect();
            let found: Vec<_> = matching(content, &lowered, needle).collect();
            assert_eq!(found, expected, "{needle}");
        }
        assert_eq!(matching(content, &lowered, "ς").count(), 3);
    }
}
