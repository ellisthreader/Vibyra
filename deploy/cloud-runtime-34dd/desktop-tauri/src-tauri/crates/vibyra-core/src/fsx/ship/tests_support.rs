//! Real repositories for the ship tests: a bare remote, a clone with an agent
//! worktree on `vibyra/task`, and helpers to drive plain Git around them.
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

pub(super) struct Fixture {
    pub dir: TempDir,
    pub bare: PathBuf,
    pub repo: PathBuf,
    /// The agent worktree root exactly as the inventory reports it.
    pub tree: String,
}

pub(super) fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub(super) fn identify(dir: &Path) {
    git(dir, &["config", "user.name", "Test"]);
    git(dir, &["config", "user.email", "test@example.test"]);
}

pub(super) fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().canonicalize().unwrap();
    let bare = base.join("remote.git");
    let repo = base.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    git(
        &base,
        &["init", "--bare", "-b", "main", bare.to_str().unwrap()],
    );
    git(&repo, &["init", "-b", "main"]);
    identify(&repo);
    std::fs::write(repo.join("readme.txt"), "hello\n").unwrap();
    std::fs::write(repo.join(".gitignore"), "ignored.log\n").unwrap();
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "-m", "initial"]);
    git(&repo, &["remote", "add", "origin", bare.to_str().unwrap()]);
    git(&repo, &["push", "-u", "origin", "main"]);
    git(&repo, &["remote", "set-head", "origin", "main"]);
    let tree = base.join("agent tree");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "vibyra/task",
            tree.to_str().unwrap(),
        ],
    );
    let root = super::super::worktrees::read_inventory(repo.to_str().unwrap())
        .unwrap()
        .worktrees
        .into_iter()
        .find(|t| !t.is_main && t.branch == "vibyra/task")
        .unwrap()
        .root;
    Fixture {
        dir,
        bare,
        repo,
        tree: root,
    }
}

impl Fixture {
    pub fn project(&self) -> &str {
        self.repo.to_str().unwrap()
    }

    pub fn path(&self, name: &str) -> PathBuf {
        Path::new(&self.tree).join(name)
    }

    pub fn write(&self, name: &str, text: &str) {
        let path = self.path(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    pub fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.path(name)).unwrap()
    }

    pub fn git(&self, args: &[&str]) -> String {
        git(Path::new(&self.tree), args)
    }

    pub fn remote_head(&self, branch: &str) -> String {
        git(&self.bare, &["rev-parse", &format!("refs/heads/{branch}")])
    }
}

pub(super) fn github_like(url: &str) -> bool {
    url.contains("remote.git")
}
