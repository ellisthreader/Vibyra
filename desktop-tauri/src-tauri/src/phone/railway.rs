use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Whether this Mac's own Railway CLI can answer for it, reported to the phone
/// in `host.state` so the Integrations page can show Railway as connected or
/// say what to do on the Mac. Nothing here runs a Railway command a phone
/// asked for; it only asks the CLI who it is logged in as. Approved reads live in
/// `railway_tools`/`railway_resources`, separate from this readiness checker.
///
/// Checked on a thread of its own, once a minute, because `host.state` is on
/// the connection's critical path and a CLI that is present but slow to answer
/// (first launch, a cold disk) must never hold the phone's first screen.
pub struct RailwayCli {
    status: Mutex<Option<Value>>,
}

const EVERY: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(5);

impl RailwayCli {
    /// Starts the checker. The first `status()` before it has answered is
    /// `Null`, which the phone reads as "the Mac has not said".
    pub fn start() -> Arc<Self> {
        let cli = Arc::new(Self {
            status: Mutex::new(None),
        });
        // A unit test's backend never shells out to ask who Railway is logged in as,
        // and says so here rather than behind a second constructor: one path through
        // this file is one path the shipped app takes.
        if cfg!(test) {
            return cli;
        }
        let worker = cli.clone();
        std::thread::Builder::new()
            .name("railway-cli".into())
            .spawn(move || loop {
                let next = probe();
                *worker.status.lock() = Some(next);
                std::thread::sleep(EVERY);
            })
            .ok();
        cli
    }

    pub fn status(&self) -> Value {
        self.status.lock().clone().unwrap_or(Value::Null)
    }
}

/// `{status: ready|signedOut|missing, account}` for the CLI as it is right now.
fn probe() -> Value {
    let Some(binary) = locate() else {
        return json!({"status": "missing", "account": Value::Null});
    };
    match whoami(&binary) {
        Some(output) => match parse_whoami(&output) {
            Some(account) => json!({"status": "ready", "account": account}),
            None => json!({"status": "signedOut", "account": Value::Null}),
        },
        None => json!({"status": "signedOut", "account": Value::Null}),
    }
}

/// Where `railway` is for the person's own shell. A Tauri app's PATH is the
/// login-less system one, which never contains a Node version manager's bin,
/// so the login shell is asked once and only the resolved path is run after.
pub(super) fn locate() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = run(
        Command::new(shell).args(["-lic", "command -v railway"]),
        TIMEOUT,
    )?;
    let path = output.lines().last()?.trim();
    (path.starts_with('/') && std::path::Path::new(path).is_file()).then(|| PathBuf::from(path))
}

fn whoami(binary: &PathBuf) -> Option<String> {
    run(Command::new(binary).arg("whoami"), TIMEOUT)
}

/// The account out of `Logged in as someone@example.com 👋`, or `None` for a
/// signed-out CLI, whose reply says so in prose that changes between versions.
pub(crate) fn parse_whoami(output: &str) -> Option<String> {
    let line = output.lines().find(|l| l.contains("Logged in as"))?;
    let rest = line.split("Logged in as").nth(1)?.trim();
    let account = rest.trim_end_matches('👋').trim().to_owned();
    (!account.is_empty()).then_some(account)
}

/// stdout of a finished, successful command, or `None` on failure, a bad exit
/// or the deadline passing (the child is killed rather than left behind).
pub(super) fn run(command: &mut Command, timeout: Duration) -> Option<String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buffer = String::new();
        use std::io::Read;
        let result = stdout.by_ref().take(262145).read_to_string(&mut buffer);
        if result.is_err() || buffer.len() > 262144 {
            return None;
        }
        Some(buffer)
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let text = reader.join().unwrap_or_default();
                return status.success().then_some(text).flatten();
            }
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(50))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_logged_in_reply_yields_the_account_and_nothing_else() {
        assert_eq!(
            parse_whoami("Logged in as ellis@example.com 👋\n").as_deref(),
            Some("ellis@example.com")
        );
        assert_eq!(
            parse_whoami("Unauthorized. Please login with `railway login`\n"),
            None
        );
        assert_eq!(parse_whoami(""), None);
        assert_eq!(
            parse_whoami("Logged in as Ellis (one@example.com) 👋"),
            Some("Ellis (one@example.com)".into())
        );
    }

    #[test]
    fn a_command_past_its_deadline_is_killed_and_reported_as_nothing() {
        let started = Instant::now();
        let out = run(
            Command::new("/bin/sleep").arg("5"),
            Duration::from_millis(200),
        );
        assert_eq!(out, None);
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn a_checker_that_has_not_answered_yet_says_nothing_at_all() {
        // Under a test this is also the checker a backend gets, so no phone
        // connection made by a test ever runs the CLI.
        assert_eq!(RailwayCli::start().status(), Value::Null);
    }
}
