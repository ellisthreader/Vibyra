//! Linux process identity uses procfs, without lsof or transcript inspection.
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;

type Families = Vec<Vec<(u32, usize)>>;
type OpenFiles = HashMap<u32, Vec<String>>;
const MAX_PROCESSES: usize = 65_536;
const MAX_FDS: usize = 4_096;

pub fn inspect(proc_root: &Path, roots: &[u32]) -> Result<(Families, OpenFiles), String> {
    let mut parents = HashMap::new();
    let entries = std::fs::read_dir(proc_root).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse().ok())
        else {
            continue;
        };
        if parents.len() >= MAX_PROCESSES {
            return Err("Process inspection exceeded its size limit".into());
        }
        let mut raw = String::new();
        if std::fs::File::open(entry.path().join("stat"))
            .and_then(|file| file.take(4096).read_to_string(&mut raw))
            .is_ok()
        {
            if let Some(parent) = parent_id(&raw) {
                parents.insert(pid, parent);
            }
        }
    }
    let families: Families = roots
        .iter()
        .map(|pid| crate::session_process_files::process_family(*pid, &parents))
        .collect();
    let pids: HashSet<_> = families.iter().flatten().map(|(pid, _)| *pid).collect();
    let files = pids
        .into_iter()
        .map(|pid| (pid, open_files(&proc_root.join(pid.to_string()).join("fd"))))
        .collect();
    Ok((families, files))
}

fn parent_id(stat: &str) -> Option<u32> {
    // The command name can itself contain spaces and ')'. State and PPID
    // start after the last closing parenthesis, not the second whitespace field.
    stat.rsplit_once(") ")?
        .1
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

fn open_files(directory: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    let entries: Vec<_> = entries.take(MAX_FDS + 1).collect();
    // A partial list could hide a second rollout and invent an exact match.
    if entries.len() > MAX_FDS {
        return Vec::new();
    }
    entries
        .into_iter()
        .flatten()
        .filter_map(|entry| std::fs::read_link(entry.path()).ok())
        .filter(|path| path.is_absolute())
        .filter_map(|path| path.into_os_string().into_string().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proc_names_can_contain_whitespace_and_parentheses() {
        assert_eq!(parent_id("10 (node launcher (cli)) S 7 10 0"), Some(7));
        assert_eq!(parent_id("truncated"), None);
        assert_eq!(parent_id("10 (codex) S missing"), None);
    }

    #[cfg(unix)]
    #[test]
    fn only_owned_process_families_are_inspected() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        for (pid, parent) in [(10, 1), (11, 10), (20, 1)] {
            let directory = root.path().join(pid.to_string());
            std::fs::create_dir_all(directory.join("fd")).unwrap();
            std::fs::write(directory.join("stat"), format!("{pid} (codex) S {parent}")).unwrap();
            symlink(
                format!("/account/sessions/{pid}.jsonl"),
                directory.join("fd/3"),
            )
            .unwrap();
            symlink("socket:[123]", directory.join("fd/4")).unwrap();
        }
        let (families, files) = inspect(root.path(), &[10]).unwrap();
        assert_eq!(families[0], [(10, 0), (11, 1)]);
        assert_eq!(files[&11], ["/account/sessions/11.jsonl"]);
        assert!(!files.contains_key(&20));
        assert!(open_files(&root.path().join("missing")).is_empty());
    }
}
