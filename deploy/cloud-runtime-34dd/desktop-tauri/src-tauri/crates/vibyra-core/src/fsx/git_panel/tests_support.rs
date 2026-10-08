//! Throwaway repositories for the Git panel tests. Never the real checkout.
use std::path::{Path, PathBuf};
use std::process::Command;

pub(super) fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args([
            "-c",
            "commit.gpgsign=false",
            "-c",
            "init.defaultBranch=main",
        ])
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub(super) struct Repo {
    pub _dir: tempfile::TempDir,
    pub root: PathBuf,
}

impl Repo {
    pub fn write(&self, name: &str, text: &str) {
        let path = self.root.join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }
    pub fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.root.join(name)).unwrap()
    }
    pub fn commit(&self, message: &str) {
        git(&self.root, &["add", "-A"]);
        git(&self.root, &["commit", "-m", message]);
    }
    pub fn git(&self, args: &[&str]) -> String {
        git(&self.root, args)
    }
}

/// `main` with one commit (`a.txt`), an identity configured.
pub(super) fn repo() -> Repo {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    git(&root, &["init", "-b", "main"]);
    git(&root, &["config", "user.name", "Test"]);
    git(&root, &["config", "user.email", "test@example.test"]);
    let repo = Repo { _dir: dir, root };
    repo.write("a.txt", "one\ntwo\nthree\n");
    repo.commit("first");
    repo
}

/// `a.txt` conflicted: main changed line two one way, `side` another.
pub(super) fn conflicted() -> Repo {
    let repo = repo();
    repo.git(&["switch", "-c", "side"]);
    repo.write("a.txt", "one\nSIDE\nthree\nside tail\n");
    repo.commit("side change");
    repo.git(&["switch", "main"]);
    repo.write("a.txt", "one\nMAIN\nthree\n");
    repo.commit("main change");
    let merge = Command::new("git")
        .arg("-C")
        .arg(&repo.root)
        .args(["merge", "side"])
        .output()
        .unwrap();
    assert!(!merge.status.success(), "the merge must conflict");
    repo
}
