//! Git diff/status must not run repository-configured clean or process filters.
use crate::{CoreError, CoreResult};
use std::path::Path;
use std::process::Command;

pub(crate) fn filter_overrides(root: &Path) -> CoreResult<Vec<String>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["config", "--name-only", "--get-regexp", "^filter\\."])
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .output()?;
    // Exit 1 means there are no matching keys. Other failures must stop the
    // read rather than accidentally run with the repository's filter programs.
    if output.status.code() == Some(1) {
        return Ok(Vec::new());
    }
    if !output.status.success() || output.stdout.len() > 64 * 1024 {
        return Err(CoreError::Task(
            "Git filter configuration could not be checked".into(),
        ));
    }
    let names = String::from_utf8(output.stdout)
        .map_err(|_| CoreError::Task("Git filter configuration is invalid".into()))?;
    let mut overrides = Vec::new();
    for name in names.lines() {
        if !name.starts_with("filter.")
            || ![".clean", ".smudge", ".process"]
                .iter()
                .any(|suffix| name.ends_with(suffix))
        {
            continue;
        }
        if name.len() > 256
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
        {
            return Err(CoreError::Task(
                "Git filter configuration is invalid".into(),
            ));
        }
        overrides.push(format!("{name}="));
    }
    overrides.sort();
    overrides.dedup();
    if overrides.len() > 128 {
        return Err(CoreError::Task(
            "Too many Git filters for a safe diff".into(),
        ));
    }
    Ok(overrides)
}
