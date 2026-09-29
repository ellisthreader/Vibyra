//! Finds project processes an agent started inside its sandbox. On macOS the
//! agent's seatbelt denies the window server, so an app started that way runs
//! with no window at all: the diagnosis the agent needs, not a wait.

use serde_json::{json, Value};
use std::path::Path;

const MAX_REPORTED: usize = 6;

#[cfg(target_os = "macos")]
pub(super) fn sandboxed_windowless(root: &Path) -> Vec<Value> {
    use std::collections::HashSet;
    extern "C" {
        // libSystem; the operation and type are optional.
        fn sandbox_check(
            pid: libc::pid_t,
            operation: *const libc::c_char,
            kind: libc::c_int,
            ...
        ) -> libc::c_int;
    }
    let Ok(root) = root.canonicalize() else {
        return Vec::new();
    };
    let table = crate::process_table::snapshot();
    let pids = table.pids();
    let cwds = crate::process_table::cwds(&pids);
    let windowed = crate::window_preview::list()
        .unwrap_or_default()
        .into_iter()
        .map(|window| window.pid as u32)
        .collect::<HashSet<_>>();
    let own = std::process::id();
    let mut found = cwds
        .into_iter()
        .filter(|(pid, cwd)| *pid != own && !windowed.contains(pid) && cwd.starts_with(&root))
        // SAFETY: plain integers and a null operation; checks, never changes.
        .filter(|(pid, _)| unsafe { sandbox_check(*pid as libc::pid_t, std::ptr::null(), 0) } == 1)
        .filter_map(|(pid, _)| Some(json!({"pid":pid,"name":table.name(pid)?})))
        .collect::<Vec<_>>();
    found.sort_by_key(|process| process["pid"].as_u64());
    found.truncate(MAX_REPORTED);
    found
}

/// Other platforms' agent sandboxes do not hide windows this way.
#[cfg(not(target_os = "macos"))]
pub(super) fn sandboxed_windowless(_root: &Path) -> Vec<Value> {
    let _ = (json!(null), MAX_REPORTED);
    Vec::new()
}
