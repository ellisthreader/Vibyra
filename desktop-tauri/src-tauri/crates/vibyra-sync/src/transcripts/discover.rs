//! Finding the agent conversations that belong to a project folder.
use super::cwd::session_meta_cwd;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

pub const MAX_SESSIONS_PER_PROVIDER: usize = 5;
pub const MAX_SESSION_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Found {
    pub provider: &'static str,
    pub id: String,
    pub path: PathBuf,
    /// Name inside the tar: `claude/<id>.jsonl` or `codex/<rollout file>`.
    pub file: String,
    pub cwd: String,
    pub mtime: u64,
}

/// Claude's folder name for a cwd: every non-alphanumeric character becomes `-` (a character outside the BMP
/// counts as two, as in JavaScript's UTF-16 string handling).
pub fn claude_dir_name(cwd: &str) -> String {
    cwd.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_string()
            } else {
                "-".repeat(c.len_utf16())
            }
        })
        .collect()
}

pub(crate) fn mtime_of(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs())
}

pub(crate) fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The spellings of the root a tool might have recorded (as given, and with symlinks resolved).
fn spellings(root: &Path) -> Vec<String> {
    let mut v = vec![root.to_string_lossy().into_owned()];
    if let Ok(c) = std::fs::canonicalize(root) {
        let c = c.to_string_lossy().into_owned();
        if !v.contains(&c) {
            v.push(c);
        }
    }
    v
}

fn newest(mut v: Vec<Found>) -> Vec<Found> {
    v.sort_by(|a, b| b.mtime.cmp(&a.mtime).then(a.file.cmp(&b.file)));
    v.truncate(MAX_SESSIONS_PER_PROVIDER);
    v
}

pub fn claude(home: &Path, root: &Path) -> Vec<Found> {
    let mut out = vec![];
    for cwd in spellings(root) {
        let dir = home.join(".claude/projects").join(claude_dir_name(&cwd));
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in rd.flatten() {
            let path = e.path();
            let (Some(stem), Ok(meta)) = (path.file_stem().and_then(|s| s.to_str()), e.metadata())
            else {
                continue;
            };
            if path.extension().and_then(|x| x.to_str()) != Some("jsonl")
                || !meta.is_file()
                || !safe_id(stem)
            {
                continue;
            }
            if meta.len() > MAX_SESSION_BYTES || out.iter().any(|f: &Found| f.id == stem) {
                continue;
            }
            out.push(Found {
                provider: "claude",
                id: stem.into(),
                file: format!("claude/{stem}.jsonl"),
                path,
                cwd: cwd.clone(),
                mtime: mtime_of(&meta),
            });
        }
    }
    newest(out)
}

fn sorted_names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| b.cmp(a));
    v
}

/// `~/.codex/sessions/YYYY/MM/DD/rollout-*-<uuid>.jsonl` whose first `session_meta` line names the root.
pub fn codex(home: &Path, root: &Path) -> Vec<Found> {
    let base = home.join(".codex/sessions");
    let wanted = spellings(root);
    let (mut out, mut looked) = (vec![], 0usize);
    'walk: for y in sorted_names(&base) {
        for m in sorted_names(&base.join(&y)) {
            for d in sorted_names(&base.join(&y).join(&m)) {
                for f in sorted_names(&base.join(&y).join(&m).join(&d)) {
                    if out.len() >= MAX_SESSIONS_PER_PROVIDER || looked >= 600 {
                        break 'walk;
                    }
                    let path = base.join(&y).join(&m).join(&d).join(&f);
                    let Some(stem) = f
                        .strip_suffix(".jsonl")
                        .filter(|s| s.starts_with("rollout-"))
                    else {
                        continue;
                    };
                    let Ok(meta) = std::fs::metadata(&path) else {
                        continue;
                    };
                    if !meta.is_file() || meta.len() > MAX_SESSION_BYTES || !safe_id(stem) {
                        continue;
                    }
                    looked += 1;
                    let cwd = first_line(&path).and_then(|l| session_meta_cwd(&l));
                    if let Some(cwd) = cwd.filter(|c| wanted.contains(c)) {
                        let id = stem
                            .get(stem.len().saturating_sub(36)..)
                            .unwrap_or(stem)
                            .to_string();
                        out.push(Found {
                            provider: "codex",
                            id,
                            file: format!("codex/{f}"),
                            path,
                            cwd,
                            mtime: mtime_of(&meta),
                        });
                    }
                }
            }
        }
    }
    newest(out)
}

/// The first line of a file, at most 2 MiB of it.
fn first_line(path: &Path) -> Option<Vec<u8>> {
    let file = std::fs::File::open(path).ok()?;
    let mut line = vec![];
    BufReader::new(file.take(2 * 1024 * 1024))
        .read_until(b'\n', &mut line)
        .ok()?;
    Some(line)
}
