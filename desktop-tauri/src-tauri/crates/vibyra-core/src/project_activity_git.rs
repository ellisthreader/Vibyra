use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::{CoreError, CoreResult};

const MAX_GIT_BYTES: usize = 4 * 1024 * 1024;

pub(super) struct GitOutput {
    pub bytes: Vec<u8>,
    pub truncated: bool,
}

pub(super) fn required_git(root: &Path, args: &[&str]) -> CoreResult<GitOutput> {
    git_output(root, args)?.ok_or_else(|| {
        CoreError::Settings(format!("Git could not read project activity: {}", args[0]))
    })
}

pub(super) fn git_output(root: &Path, args: &[&str]) -> CoreResult<Option<GitOutput>> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let mut bytes = Vec::new();
    child
        .stdout
        .take()
        .ok_or_else(|| CoreError::Task("Git stdout was unavailable".into()))?
        .take((MAX_GIT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    let truncated = bytes.len() > MAX_GIT_BYTES;
    if truncated {
        bytes.truncate(MAX_GIT_BYTES);
        let _ = child.kill();
    }
    let status = child.wait()?;
    Ok((status.success() || truncated).then_some(GitOutput { bytes, truncated }))
}
