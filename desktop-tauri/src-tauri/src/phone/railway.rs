use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

/// Whether this Mac's own Railway CLI can answer for it, reported to the phone
/// in `host.state` so the Integrations page can show Railway as connected or
/// say what to do on the Mac. Nothing here runs a Railway command a phone
/// asked for; it only asks the CLI who it is logged in as. Approved reads live in
/// `railway_tools`/`railway_resources`, separate from this readiness checker.
///
/// Checked on a thread of its own because `host.state` is on the connection's
/// critical path and a CLI that is present but slow to answer (first launch, a
/// cold disk) must never hold the phone's first screen. One checker serves the
/// whole app and asks at most once a minute, and only while a phone asks: every
/// restart of the phone connection used to start another checker that never
/// stopped, each running the CLI once a minute for the life of the app.
pub struct RailwayCli {
    status: Mutex<Option<Value>>,
    probed: Mutex<Option<Instant>>,
}

const EVERY: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(5);
/// How long a login shell's answer stands when `railway` is not on PATH.
const LOOKUP_EVERY: Duration = Duration::from_secs(600);

static SHARED: OnceLock<Arc<RailwayCli>> = OnceLock::new();

impl RailwayCli {
    /// The app's checker, asked for a fresh answer so the phone's first
    /// `host.state` usually has one. The first `status()` before it has
    /// answered is `Null`, which the phone reads as "the Mac has not said".
    pub fn start() -> Arc<Self> {
        // A unit test's backend never shells out to ask who Railway is logged in as,
        // and says so here rather than behind a second constructor: one path through
        // this file is one path the shipped app takes.
        if cfg!(test) {
            return Arc::new(Self::idle());
        }
        let cli = SHARED.get_or_init(|| Arc::new(Self::idle())).clone();
        cli.refresh();
        cli
    }

    fn idle() -> Self {
        Self {
            status: Mutex::new(None),
            probed: Mutex::new(None),
        }
    }

    /// The last answer; one a minute old is refreshed in the background.
    pub fn status(self: &Arc<Self>) -> Value {
        self.refresh();
        self.status.lock().clone().unwrap_or(Value::Null)
    }

    fn refresh(self: &Arc<Self>) {
        if cfg!(test) {
            return;
        }
        {
            let mut probed = self.probed.lock();
            if probed.is_some_and(|at| at.elapsed() < EVERY) {
                return;
            }
            *probed = Some(Instant::now());
        }
        let cli = self.clone();
        std::thread::Builder::new()
            .name("railway-cli".into())
            .spawn(move || {
                let next = probe();
                *cli.status.lock() = Some(next);
            })
            .ok();
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

/// Where `railway` is for the person's own shell. Startup already put the
/// login shell's PATH on this process (`launch_env::user_path::install`), so
/// PATH is searched in-process first. The login shell itself — which sources
/// the person's whole shell setup — is asked only when that misses, and its
/// answer stands for ten minutes.
pub(super) fn locate() -> Option<PathBuf> {
    if let Some(found) = on_path("railway") {
        return Some(found);
    }
    static LOOKUP: Mutex<Option<(Instant, Option<PathBuf>)>> = Mutex::new(None);
    let mut lookup = LOOKUP.lock();
    if let Some((at, found)) = lookup.as_ref() {
        if at.elapsed() < LOOKUP_EVERY {
            return found.clone();
        }
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let found = run(
        Command::new(shell).args(["-lic", "command -v railway"]),
        TIMEOUT,
    )
    .and_then(|output| {
        let path = output.lines().last()?.trim().to_owned();
        (path.starts_with('/') && Path::new(&path).is_file()).then(|| PathBuf::from(path))
    });
    *lookup = Some((Instant::now(), found.clone()));
    found
}

fn on_path(program: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|dir| dir.join(program))
        .find(|candidate| is_executable(candidate))
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
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

#[path = "railway_process.rs"]
mod process;
pub(super) use process::run;

#[cfg(test)]
#[path = "railway_tests.rs"]
mod tests;
