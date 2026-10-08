//! Hardened git runner. Every call disables hooks and fsmonitor, drops inherited repository overrides and
//! never prompts. Repo-defined clean filters are never reached: blobs are written by `objects`, not `add`.
use crate::error::{Result, SyncError};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Clone, Debug)]
pub struct Git {
    cwd: PathBuf,
    git_dir: Option<PathBuf>,
    work_tree: Option<PathBuf>,
    index: Option<PathBuf>,
}

impl Git {
    /// Runs inside `root` (a person's own repository; read-only calls only).
    pub fn in_dir(root: &Path) -> Git {
        Git {
            cwd: root.to_path_buf(),
            git_dir: None,
            work_tree: None,
            index: None,
        }
    }
    /// Runs against the bare shadow repository `dir`.
    pub fn shadow(dir: &Path) -> Git {
        Git {
            cwd: dir.to_path_buf(),
            git_dir: Some(dir.to_path_buf()),
            work_tree: None,
            index: None,
        }
    }
    /// Lets a shadow command read `root` as its work tree (for `ls-files --others --exclude-standard`).
    pub fn with_work_tree(mut self, root: &Path) -> Git {
        self.work_tree = Some(root.to_path_buf());
        self.cwd = root.to_path_buf();
        self
    }
    /// A throwaway index file, so nothing but this file is ever written besides objects and refs.
    pub fn with_index(mut self, index: &Path) -> Git {
        self.index = Some(index.to_path_buf());
        self
    }

    pub fn out(&self, args: &[&str]) -> Result<Vec<u8>> {
        self.go(args, None)
    }
    pub fn text(&self, args: &[&str]) -> Result<String> {
        Ok(String::from_utf8_lossy(&self.out(args)?).trim().to_string())
    }
    /// `Some(text)` when the command succeeds, `None` when it fails (for `rev-parse --verify` style probes).
    pub fn try_text(&self, args: &[&str]) -> Option<String> {
        self.text(args).ok().filter(|s| !s.is_empty())
    }

    pub fn go(&self, args: &[&str], input: Option<&[u8]>) -> Result<Vec<u8>> {
        let mut cmd = Command::new("git");
        cmd.args([
            "--no-pager",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
        ])
        .args([
            "-c",
            "protocol.ext.allow=never",
            "-c",
            "gc.autoDetach=false",
        ]);
        if let Some(dir) = &self.git_dir {
            cmd.arg("--git-dir").arg(dir);
        }
        if let Some(tree) = &self.work_tree {
            cmd.arg("--work-tree")
                .arg(tree)
                .args(["-c", "core.bare=false"]);
        }
        cmd.args(args).current_dir(&self.cwd);
        for key in [
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_PARAMETERS",
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_COMMON_DIR",
            "GIT_EXTERNAL_DIFF",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        ] {
            cmd.env_remove(key);
        }
        cmd.env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_ATTR_NOSYSTEM", "1")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_AUTHOR_NAME", "Vibyra Sync")
            .env("GIT_AUTHOR_EMAIL", "sync@vibyra.app")
            .env("GIT_COMMITTER_NAME", "Vibyra Sync")
            .env("GIT_COMMITTER_EMAIL", "sync@vibyra.app");
        if let Some(index) = &self.index {
            cmd.env("GIT_INDEX_FILE", index);
        }
        cmd.stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        let mut child = cmd
            .spawn()
            .map_err(|_| SyncError::Git("Git is unavailable on this computer.".into()))?;
        // Feed stdin from a thread so a large input cannot deadlock against a full stdout pipe.
        let writer = match (input, child.stdin.take()) {
            (Some(bytes), Some(mut stdin)) => {
                let bytes = bytes.to_vec();
                Some(std::thread::spawn(move || {
                    let _ = stdin.write_all(&bytes);
                }))
            }
            _ => None,
        };
        let output = child
            .wait_with_output()
            .map_err(|_| SyncError::Git("Git did not finish.".into()))?;
        if let Some(w) = writer {
            let _ = w.join();
        }
        if output.status.success() {
            return Ok(output.stdout);
        }
        Err(SyncError::Git(clean_error(&String::from_utf8_lossy(
            &output.stderr,
        ))))
    }
}

/// First lines of git's complaint, with any `user:token@` before a host removed.
pub fn clean_error(stderr: &str) -> String {
    let mut out = String::new();
    for word in stderr.trim().split_inclusive(char::is_whitespace) {
        match word.split_once("://") {
            Some((scheme, rest)) if rest.contains('@') => {
                let after = rest.rsplit_once('@').map_or(rest, |(_, host)| host);
                out.push_str(&format!("{scheme}://{after}"));
            }
            _ => out.push_str(word),
        }
    }
    let out: String = out.chars().take(400).collect();
    if out.is_empty() {
        "Git refused this operation.".into()
    } else {
        out
    }
}

/// Creates the bare shadow repository at `dir` when it does not exist yet.
pub fn ensure_shadow(dir: &Path) -> Result<Git> {
    if !dir.join("HEAD").exists() {
        std::fs::create_dir_all(dir)?;
        let init = Git {
            cwd: dir.to_path_buf(),
            git_dir: None,
            work_tree: None,
            index: None,
        };
        init.out(&["init", "--bare", "-q", "--object-format=sha1", "."])?;
        let git = Git::shadow(dir);
        git.out(&["config", "core.logAllRefUpdates", "false"])?;
        git.out(&["config", "gc.auto", "6000"])?;
    }
    Ok(Git::shadow(dir))
}
