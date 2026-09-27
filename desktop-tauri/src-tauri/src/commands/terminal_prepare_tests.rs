use super::{resolve_cwd, CreateTerminalRequest};
use std::path::PathBuf;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "vibyra-resume-cwd-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("worktrees/saved")).unwrap();
        std::fs::create_dir_all(root.join("source")).unwrap();
        Self(root)
    }
    fn request(&self, cwd: &str) -> CreateTerminalRequest {
        serde_json::from_value(serde_json::json!({
            "agentId": "codex", "resume": true, "workspaceMode": "safe",
            "resumeCwd": self.0.join(cwd).to_string_lossy()
        }))
        .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn resuming_reuses_the_existing_worktree_including_its_uncommitted_work() {
    let f = Fixture::new();
    std::fs::write(f.0.join("worktrees/saved/draft.txt"), "keep me").unwrap();
    let cwd = resolve_cwd(&f.request("worktrees/saved"), None, &f.0.join("worktrees"))
        .unwrap()
        .unwrap();
    assert_eq!(
        PathBuf::from(cwd),
        f.0.join("worktrees/saved").canonicalize().unwrap()
    );
    assert_eq!(
        std::fs::read_to_string(f.0.join("worktrees/saved/draft.txt")).unwrap(),
        "keep me"
    );
}

#[test]
fn a_missing_saved_worktree_fails_instead_of_creating_a_fresh_one() {
    let f = Fixture::new();
    assert!(resolve_cwd(&f.request("worktrees/gone"), None, &f.0.join("worktrees")).is_err());
    assert!(!f.0.join("worktrees/gone").exists());
}

#[test]
fn resume_cannot_escape_vibyras_worktrees() {
    let f = Fixture::new();
    assert!(resolve_cwd(&f.request("source"), None, &f.0.join("worktrees")).is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(f.0.join("source"), f.0.join("worktrees/link")).unwrap();
        assert!(resolve_cwd(&f.request("worktrees/link"), None, &f.0.join("worktrees")).is_err());
    }
}
