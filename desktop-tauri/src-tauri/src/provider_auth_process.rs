use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub fn command_output(program: &str, args: &[&str]) -> Option<(bool, String)> {
    command_streams(program, args).map(|(success, stdout, _)| (success, stdout))
}

/// Returns both streams because provider CLIs disagree about where status text
/// belongs: `claude auth status --json` prints to stdout, `codex login status`
/// prints to stderr. Probes that read human-readable output must check both.
pub fn command_streams(program: &str, args: &[&str]) -> Option<(bool, String, String)> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    strip_credentials(&mut command);
    let mut child = command.spawn().ok()?;
    let stdout = drain(child.stdout.take()?);
    let stderr = drain(child.stderr.take()?);
    let started = Instant::now();
    let success = loop {
        if let Some(status) = child.try_wait().ok()? {
            break status.success();
        }
        if started.elapsed() >= Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        thread::sleep(Duration::from_millis(25));
    };
    Some((success, stdout.join().ok()?, stderr.join().ok()?))
}

/// Both pipes drain off-thread so a provider that fills one buffer while we
/// wait on the other cannot deadlock the probe.
fn drain<R: Read + Send + 'static>(mut reader: R) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut output = String::new();
        let _ = reader.read_to_string(&mut output);
        output
    })
}

pub fn command_status(program: &str, args: &[&str]) -> Result<bool, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    strip_credentials(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status.success()),
            Ok(None) if started.elapsed() < Duration::from_secs(5) => {
                thread::sleep(Duration::from_millis(25));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{program} did not finish in time."));
            }
            Err(error) => return Err(format!("Could not read {program} status: {error}")),
        }
    }
}

pub fn credential_env_names() -> Vec<String> {
    std::env::vars_os()
        .filter_map(|(key, _)| key.into_string().ok())
        .filter(|key| is_credential_name(key))
        .collect()
}

pub fn strip_credentials(command: &mut Command) {
    for (key, _) in std::env::vars_os() {
        if is_credential_name(&key.to_string_lossy()) {
            command.env_remove(key);
        }
    }
}

fn is_credential_name(name: &str) -> bool {
    let name = name.to_ascii_uppercase();
    [
        "_API_KEY",
        "_ACCESS_KEY_ID",
        "_SECRET_ACCESS_KEY",
        "_ACCESS_TOKEN",
        "_AUTH_TOKEN",
        "_SESSION_TOKEN",
        "_REFRESH_TOKEN",
        "_TOKEN",
        "_SECRET",
        "_PASSWORD",
        "_PRIVATE_KEY",
        "_CREDENTIALS",
    ]
    .iter()
    .any(|suffix| name.ends_with(suffix))
}

pub fn stop_child(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/pid", &child.id().to_string(), "/T", "/F"])
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::is_credential_name;

    #[test]
    fn recognizes_common_provider_and_cloud_credentials() {
        for name in [
            "OPENAI_API_KEY",
            "ANTHROPIC_AUTH_TOKEN",
            "AWS_SESSION_TOKEN",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "GOOGLE_APPLICATION_CREDENTIALS",
        ] {
            assert!(is_credential_name(name), "{name}");
        }
        assert!(!is_credential_name("PATH"));
        assert!(!is_credential_name("SSH_AUTH_SOCK"));
    }
}
