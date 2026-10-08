//! Windows process identity: parents from a Toolhelp snapshot, and which
//! process holds each recent Codex rollout open from the Restart Manager (the
//! documented API installers use to find who has a file open). No `lsof` or
//! `/proc` exists on Windows, and recency alone cannot tell two chats apart.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

type Families = Vec<Vec<(u32, usize)>>;
type OpenFiles = HashMap<u32, Vec<String>>;
/// Rollouts a running Codex could still be writing.
const RECENT: Duration = Duration::from_secs(3 * 24 * 60 * 60);
const MAX_ROLLOUTS: usize = 96;

pub fn inspect(roots: &[u32], homes: &[PathBuf]) -> Result<(Families, OpenFiles), String> {
    let parents = parents()?;
    let families: Families = roots
        .iter()
        .map(|pid| crate::session_process_files::process_family(*pid, &parents))
        .collect();
    let mut files = OpenFiles::new();
    for rollout in homes.iter().flat_map(|home| recent_rollouts(home)) {
        for pid in holders(&rollout)? {
            files
                .entry(pid)
                .or_default()
                .push(rollout.to_string_lossy().into_owned());
        }
    }
    Ok((families, files))
}

/// `pid → parent pid` for every process, from one snapshot.
fn parents() -> Result<HashMap<u32, u32>, String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    // SAFETY: the snapshot handle is closed below; the entry is sized for the call.
    unsafe {
        let snapshot =
            CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|e| e.to_string())?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut parents = HashMap::new();
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        while more && parents.len() < 65_536 {
            parents.insert(entry.th32ProcessID, entry.th32ParentProcessID);
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
        Ok(parents)
    }
}

/// `sessions/YYYY/MM/DD/rollout-*.jsonl` written in the last few days, newest
/// first, bounded so a long history never makes this slow.
fn recent_rollouts(home: &Path) -> Vec<PathBuf> {
    let since = SystemTime::now() - RECENT;
    let mut found = Vec::new();
    let mut stack = vec![(home.join("sessions"), 0)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() && depth < 3 {
                stack.push((path, depth + 1));
            } else if meta.is_file() && meta.modified().is_ok_and(|at| at >= since) {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("rollout-") && name.ends_with(".jsonl") {
                    found.push((meta.modified().unwrap_or(since), path));
                }
            }
        }
    }
    found.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    found
        .into_iter()
        .take(MAX_ROLLOUTS)
        .map(|(_, path)| path)
        .collect()
}

/// The processes that have `file` open, from a Restart Manager session.
pub(crate) fn holders(file: &Path) -> Result<Vec<u32>, String> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::System::RestartManager::{
        RmEndSession, RmGetList, RmRegisterResources, RmStartSession, CCH_RM_SESSION_KEY,
        RM_PROCESS_INFO,
    };
    let wide: Vec<u16> = file.as_os_str().encode_wide_nul();
    let mut session = 0u32;
    let mut key = [0u16; CCH_RM_SESSION_KEY as usize + 1];
    // SAFETY: every buffer outlives the calls that use it; the session ends below.
    unsafe {
        if RmStartSession(&mut session, None, PWSTR(key.as_mut_ptr())).is_err() {
            return Err("Could not start a Restart Manager session".into());
        }
        let result = (|| {
            let names = [PCWSTR(wide.as_ptr())];
            if RmRegisterResources(session, Some(&names), None, None).is_err() {
                return Ok(Vec::new());
            }
            let (mut needed, mut reasons) = (0u32, 0u32);
            let mut infos = vec![RM_PROCESS_INFO::default(); 16];
            for _ in 0..3 {
                let mut count = infos.len() as u32;
                let status = RmGetList(
                    session,
                    &mut needed,
                    &mut count,
                    Some(infos.as_mut_ptr()),
                    &mut reasons,
                );
                if status.is_ok() {
                    return Ok(infos[..count as usize]
                        .iter()
                        .map(|i| i.Process.dwProcessId)
                        .collect());
                }
                infos.resize(needed as usize + 4, RM_PROCESS_INFO::default());
            }
            Ok(Vec::new())
        })();
        let _ = RmEndSession(session);
        result
    }
}

trait EncodeWideNul {
    fn encode_wide_nul(&self) -> Vec<u16>;
}

impl EncodeWideNul for std::ffi::OsStr {
    fn encode_wide_nul(&self) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        self.encode_wide().chain(std::iter::once(0)).collect()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_restart_manager_names_this_process_for_a_file_it_holds_open() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rollout-held.jsonl");
        let _held = std::fs::File::create(&path).unwrap();
        let holders = super::holders(&path).unwrap();
        assert!(holders.contains(&std::process::id()), "{holders:?}");
    }

    #[test]
    fn only_recent_rollout_files_are_candidates() {
        let home = tempfile::tempdir().unwrap();
        let day = home.path().join("sessions/2026/10/03");
        std::fs::create_dir_all(&day).unwrap();
        std::fs::write(day.join("rollout-2026-10-03T10-00-00-abc.jsonl"), "").unwrap();
        std::fs::write(day.join("notes.txt"), "").unwrap();
        let found = super::recent_rollouts(home.path());
        assert_eq!(found.len(), 1);
    }
}
