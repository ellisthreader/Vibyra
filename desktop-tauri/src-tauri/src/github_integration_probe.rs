use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::github_integration::GithubIntegrationStatus;

const TIMEOUT: Duration = Duration::from_secs(20);
const REQUIRED_SCOPES: [&str; 4] = ["repo", "workflow", "read:org", "gist"];
const GITHUB_CREDENTIAL_ENV: [&str; 4] = [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GH_ENTERPRISE_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
];

pub fn probe(program: &OsStr) -> GithubIntegrationStatus {
    if run(program, &["--version"]).is_err() {
        return GithubIntegrationStatus::default();
    }
    let login = run(program, &["api", "user", "--jq", ".login"])
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let permissions_ready = login.as_deref().is_some_and(|login| {
        capture(program, &["auth", "status", "--hostname", "github.com"])
            .ok()
            .is_some_and(|(success, stdout, stderr)| {
                success && (has_scopes(&stdout, login) || has_scopes(&stderr, login))
            })
    });
    GithubIntegrationStatus {
        gh_installed: true,
        connected: login.is_some(),
        connecting: false,
        login,
        permissions_ready,
        error: None,
    }
}

pub fn run(program: &OsStr, args: &[&str]) -> Result<String, String> {
    let (success, stdout, _) = capture(program, args)?;
    success
        .then_some(stdout)
        .ok_or_else(|| "GitHub CLI command failed.".to_string())
}

fn capture(program: &OsStr, args: &[&str]) -> Result<(bool, String, String), String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    prepare(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "GitHub CLI is not installed.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not read GitHub CLI.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not read GitHub CLI.".to_string())?;
    let stdout_reader = thread::spawn(move || bounded_read(stdout));
    let stderr_reader = thread::spawn(move || bounded_read(stderr));
    let started = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if started.elapsed() < TIMEOUT => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                crate::provider_auth_process::stop_child(&mut child);
                return Err("GitHub CLI did not finish in time.".into());
            }
            Err(_) => return Err("Could not read GitHub CLI status.".into()),
        }
    };
    Ok((
        success,
        stdout_reader.join().unwrap_or_default(),
        stderr_reader.join().unwrap_or_default(),
    ))
}

pub fn prepare(command: &mut Command) {
    crate::provider_auth_process::prepare_child(command);
    for name in GITHUB_CREDENTIAL_ENV {
        command.env_remove(name);
    }
}

fn bounded_read(mut stdout: impl Read) -> String {
    let mut bytes = Vec::new();
    let _ = stdout.by_ref().take(16_384).read_to_end(&mut bytes);
    let _ = std::io::copy(&mut stdout, &mut std::io::sink());
    String::from_utf8_lossy(&bytes).into_owned()
}

fn has_scopes(output: &str, expected_login: &str) -> bool {
    let mut matching_account = false;
    for line in output.lines() {
        if let Some(login) = status_login(line) {
            matching_account = login == expected_login;
        }
        let Some((_, scopes)) = line.split_once("Token scopes:") else {
            continue;
        };
        if matching_account
            && REQUIRED_SCOPES.iter().all(|required| {
                scopes
                    .split(',')
                    .map(|scope| scope.trim().trim_matches(['\'', '"']))
                    .any(|scope| scope == *required)
            })
        {
            return true;
        }
    }
    false
}

fn status_login(line: &str) -> Option<&str> {
    [
        "Logged in to github.com account ",
        "Logged in to github.com as ",
    ]
    .iter()
    .find_map(|marker| line.split_once(marker).map(|(_, login)| login))
    .and_then(|login| login.split_whitespace().next())
}

pub fn default_program() -> OsString {
    OsString::from("gh")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_every_github_token_override() {
        let mut command = Command::new("gh");
        prepare(&mut command);
        let removed: Vec<_> = command
            .get_envs()
            .filter(|(_, value)| value.is_none())
            .map(|(name, _)| name.to_string_lossy().into_owned())
            .collect();
        for name in GITHUB_CREDENTIAL_ENV {
            assert!(removed.iter().any(|removed| removed == name));
        }
    }

    #[test]
    fn reads_required_scopes_from_legacy_status_output() {
        let output = "  ✓ Logged in to github.com account octocat (keyring)\n  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'\n";
        assert!(has_scopes(output, "octocat"));
        assert!(!has_scopes(output, "another-account"));
        assert!(!has_scopes(
            "Logged in to github.com account octocat\nToken scopes: 'repo', 'workflow'",
            "octocat"
        ));
    }
}
