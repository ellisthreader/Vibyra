//! Allow only executable files belonging to the provider process we started.
use std::path::PathBuf;

pub fn executables(pid: u32) -> Vec<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let mut pending = vec![pid];
        let mut paths = Vec::new();
        let mut visited = std::collections::HashSet::new();
        while let Some(pid) = pending.pop() {
            if visited.len() >= 16 || !visited.insert(pid) {
                continue;
            }
            if let Ok(path) = std::fs::read_link(format!("/proc/{pid}/exe")) {
                if path.is_absolute() && path.is_file() && !paths.contains(&path) {
                    if path.file_name().is_some_and(|name| name == "codex") {
                        if let Some(target) = path.parent().and_then(|p| p.parent()) {
                            // The npm package adds this bundled search binary
                            // to PATH; permit the file, never its parent tree.
                            if let Ok(rg) = target.join("codex-path/rg").canonicalize() {
                                if rg.is_file() && !paths.contains(&rg) {
                                    paths.push(rg);
                                }
                            }
                        }
                    }
                    paths.push(path);
                }
            }
            // The npm launcher is a Node process with the native provider as
            // its child. Inspect before starting a thread or any model tools.
            if let Ok(children) =
                std::fs::read_to_string(format!("/proc/{pid}/task/{pid}/children"))
            {
                pending.extend(
                    children
                        .split_whitespace()
                        .filter_map(|p| p.parse::<u32>().ok()),
                );
            }
        }
        paths
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = pid;
        Vec::new()
    }
}

#[cfg(all(test, target_os = "linux"))]
#[test]
fn runtime_grants_are_files_from_the_selected_process() {
    let paths = executables(std::process::id());
    assert!(paths.contains(&std::env::current_exe().unwrap()));
    assert!(paths.iter().all(|p| p.is_file()));
    assert!(executables(u32::MAX).is_empty());
}
