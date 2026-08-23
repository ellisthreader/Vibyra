use std::path::Path;

/// Finds the Codex rollout held open by one PTY process tree.
///
/// Codex starts through a small Node launcher, so the PTY child itself does
/// not own the rollout file; its native child does. Linux exposes both the
/// descendants and their open files through `/proc`, which lets Vibyra retain
/// the exact UUID without reading chat contents or Codex credentials.
#[cfg(target_os = "linux")]
pub fn codex_session_id(root_pid: u32) -> Option<String> {
    let mut pending = vec![root_pid];
    let mut seen = std::collections::HashSet::new();
    while let Some(pid) = pending.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(id) = open_rollout_id(pid) {
            return Some(id);
        }
        let children = format!("/proc/{pid}/task/{pid}/children");
        if let Ok(raw) = std::fs::read_to_string(children) {
            pending.extend(
                raw.split_whitespace()
                    .filter_map(|value| value.parse::<u32>().ok()),
            );
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn open_rollout_id(pid: u32) -> Option<String> {
    let entries = std::fs::read_dir(format!("/proc/{pid}/fd")).ok()?;
    entries
        .flatten()
        .filter_map(|entry| std::fs::read_link(entry.path()).ok())
        .find_map(|target| session_id_from_path(&target))
}

#[cfg(not(target_os = "linux"))]
pub fn codex_session_id(_root_pid: u32) -> Option<String> {
    None
}

fn session_id_from_path(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(".jsonl")?;
    if !stem.starts_with("rollout-") || stem.len() < 37 {
        return None;
    }
    let split = stem.len() - 36;
    if stem.as_bytes().get(split.wrapping_sub(1)) != Some(&b'-') {
        return None;
    }
    let id = &stem[split..];
    valid_uuid(id).then(|| id.to_string())
}

fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::{codex_session_id, session_id_from_path};
    use std::path::Path;

    #[test]
    fn extracts_only_a_rollout_uuid() {
        let id = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";
        let path = format!("/home/user/.codex/sessions/2026/08/23/rollout-date-{id}.jsonl");
        assert_eq!(session_id_from_path(Path::new(&path)).as_deref(), Some(id));
        assert_eq!(
            session_id_from_path(Path::new("/tmp/not-a-rollout.jsonl")),
            None
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn finds_an_open_rollout_in_the_live_process_tree() {
        let id = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";
        let path = std::env::temp_dir().join(format!(
            "rollout-vibyra-process-test-{}-{id}.jsonl",
            std::process::id()
        ));
        let file = std::fs::File::create(&path).expect("create live rollout fixture");

        assert_eq!(codex_session_id(std::process::id()).as_deref(), Some(id));

        drop(file);
        std::fs::remove_file(path).expect("remove live rollout fixture");
    }
}
