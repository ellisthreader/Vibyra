use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// Provider CLIs are npm wrappers that exec a large native binary. Warm they
/// answer in ~100 ms, but a first probe after boot has to fault that binary in
/// and was measured at over 5 s — long enough that the old 5 s budget reported
/// a signed-in account as unverifiable. Probes run off the IPC thread, so the
/// wider budget costs a slow start rather than a frozen window.
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

pub fn command_output(
    program: &str,
    args: &[&str],
    env: Option<(String, String)>,
) -> Option<(bool, String)> {
    command_streams(program, args, env).map(|(success, stdout, _)| (success, stdout))
}

/// Returns both streams because provider CLIs disagree about where status text
/// belongs: `claude auth status --json` prints to stdout, `codex login status`
/// prints to stderr. Probes that read human-readable output must check both.
pub fn command_streams(
    program: &str,
    args: &[&str],
    env: Option<(String, String)>,
) -> Option<(bool, String, String)> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    prepare_child(&mut command);
    select_account(&mut command, env);
    let mut child = command.spawn().ok()?;
    let stdout = drain(child.stdout.take()?);
    let stderr = drain(child.stderr.take()?);
    let started = Instant::now();
    let success = loop {
        if let Some(status) = child.try_wait().ok()? {
            break status.success();
        }
        if started.elapsed() >= PROBE_TIMEOUT {
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

pub fn command_status(
    program: &str,
    args: &[&str],
    env: Option<(String, String)>,
) -> Result<bool, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    prepare_child(&mut command);
    select_account(&mut command, env);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status.success()),
            Ok(None) if started.elapsed() < PROBE_TIMEOUT => {
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

/// Points one CLI invocation at one account's credentials.
///
/// Setting only, never clearing. The default account is defined as "wherever
/// this CLI looks on its own" — so if the user exports `CODEX_HOME` in their
/// shell, that *is* their default account, and stripping it would move their
/// existing login out from under them. A managed account overrides the
/// variable instead, which is enough to isolate it.
pub fn select_account(command: &mut Command, env: Option<(String, String)>) {
    if let Some((name, value)) = env {
        command.env(name, value);
    }
}

/// Everything a provider CLI needs before it is spawned: the user's own API
/// credentials kept out of it, and the AppImage's environment capture undone so
/// it runs in the environment the user's shell would have given it.
pub fn prepare_child(command: &mut Command) {
    strip_credentials(command);
    vibyra_core::launch_env::sanitize_command(command);
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
