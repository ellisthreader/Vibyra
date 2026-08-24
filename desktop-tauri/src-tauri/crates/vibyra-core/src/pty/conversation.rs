#[cfg(any(target_os = "linux", test))]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::path::PathBuf;

#[cfg(target_os = "linux")]
use super::rollout_source;

/// Finds the Codex rollout held open by one PTY process tree.
///
/// Codex starts through a small Node launcher, so the PTY child itself does
/// not own the rollout file; its native child does. Linux exposes both the
/// descendants and their open files through `/proc`, which lets Vibyra find
/// the exact conversation without asking Codex to announce one.
#[cfg(target_os = "linux")]
pub fn codex_rollout_path(root_pid: u32) -> Option<PathBuf> {
    let mut pending = vec![root_pid];
    let mut seen = std::collections::HashSet::new();
    while let Some(pid) = pending.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(path) = open_rollout(pid) {
            return Some(path);
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

/// The conversation UUID alone, which is what `codex resume` is given.
#[cfg(target_os = "linux")]
pub fn codex_session_id(root_pid: u32) -> Option<String> {
    codex_rollout_path(root_pid)
        .as_deref()
        .and_then(session_id_from_path)
}

/// The pane's own rollout, out of every one this process holds open.
///
/// Codex keeps its subagents in-process, so a busy pane has several rollouts
/// open at once and only one of them is the conversation the pane is. See
/// `rollout_source`, which reads each file's header to tell them apart.
///
/// Descriptors are walked in numeric order rather than whatever `read_dir`
/// yields, so the answer is deterministic across sweeps and the conversation
/// the process opened with — the oldest, and so the lowest — is reached first.
/// That is a tie-break, not the rule: the header check is what excludes a
/// subagent, and it excludes one at any descriptor number.
#[cfg(target_os = "linux")]
fn open_rollout(pid: u32) -> Option<PathBuf> {
    let entries = std::fs::read_dir(format!("/proc/{pid}/fd")).ok()?;
    let mut rollouts: Vec<(u32, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let descriptor = entry.file_name().to_str()?.parse::<u32>().ok()?;
            let target = std::fs::read_link(entry.path()).ok()?;
            session_id_from_path(&target)
                .is_some()
                .then_some((descriptor, target))
        })
        .collect();
    rollouts.sort_by_key(|(descriptor, _)| *descriptor);
    rollouts
        .into_iter()
        .map(|(_, target)| target)
        .find(|target| rollout_source::is_own_conversation(target))
}

#[cfg(not(target_os = "linux"))]
pub fn codex_rollout_path(_root_pid: u32) -> Option<std::path::PathBuf> {
    None
}

#[cfg(not(target_os = "linux"))]
pub fn codex_session_id(_root_pid: u32) -> Option<String> {
    None
}

#[cfg(any(target_os = "linux", test))]
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

#[cfg(any(target_os = "linux", test))]
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
    #[cfg(target_os = "linux")]
    use super::codex_session_id;
    use super::session_id_from_path;
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

    /// Writes a rollout and keeps it open, the way a live Codex process holds
    /// one. The handle is returned because dropping it closes the descriptor
    /// this is all about.
    #[cfg(target_os = "linux")]
    fn hold_rollout(name: &str, id: &str, source: &str) -> (std::fs::File, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "rollout-vibyra-{name}-{}-{id}.jsonl",
            std::process::id()
        ));
        std::fs::write(
            &path,
            format!(r#"{{"type":"session_meta","payload":{{"id":"{id}","source":{source}}}}}"#),
        )
        .expect("write live rollout fixture");
        let file = std::fs::File::open(&path).expect("hold live rollout fixture");
        (file, path)
    }

    /// Both halves in one test on purpose: these hold real descriptors on the
    /// *test process*, and `codex_session_id` scans all of them, so two such
    /// tests running in parallel would read each other's fixtures.
    #[cfg(target_os = "linux")]
    #[test]
    fn finds_the_panes_own_rollout_and_never_a_subagents() {
        let subagent = "11111111-2222-4333-8444-555555555555";
        let own = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";
        // Opened first, so it takes the lower descriptor and would win on
        // order alone. That is precisely how a pane came back resumed into a
        // subagent's conversation instead of its own.
        let (held_subagent, subagent_path) = hold_rollout(
            "subagent",
            subagent,
            r#"{"subagent":{"thread_spawn":{"depth":1}}}"#,
        );
        let (held_own, own_path) = hold_rollout("own", own, r#""cli""#);

        assert_eq!(codex_session_id(std::process::id()).as_deref(), Some(own));

        drop(held_subagent);
        drop(held_own);
        std::fs::remove_file(subagent_path).expect("remove live rollout fixture");
        std::fs::remove_file(own_path).expect("remove live rollout fixture");
    }
}
