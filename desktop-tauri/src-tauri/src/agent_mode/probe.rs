//! Asking the installed CLIs what they can do.
//!
//! Both engines are npm packages the user updates on their own schedule, and
//! both have moved flags inside a release series. Vibyra offers only controls
//! it has evidence for, so the answer comes from the CLI's own `--version` and
//! `--help` rather than from a table compiled into the app.
//!
//! Cached for the life of the process. A user who updates Codex mid-session
//! gets the new answer on the next launch, which is the right trade: probing
//! two CLIs costs a second, and doing it before every turn would put that on
//! the critical path of every message.

use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

use vibyra_core::agent_model::Engine;
use vibyra_core::agent_runtime::capabilities::interpret;
use vibyra_core::agent_runtime::EngineCapabilities;

static CACHE: OnceLock<Vec<EngineCapabilities>> = OnceLock::new();

/// Both engines, probed once.
pub fn probe_engines() -> Vec<EngineCapabilities> {
    CACHE
        .get_or_init(|| {
            [Engine::Claude, Engine::Codex]
                .into_iter()
                .map(probe)
                .collect()
        })
        .clone()
}

fn probe(engine: Engine) -> EngineCapabilities {
    let program = engine.as_str();
    let version = capture(program, &["--version"]).unwrap_or_default();
    // Codex keeps the flags that matter under a subcommand, so its help has to
    // be asked for at the level the adapter actually uses.
    let help = match engine {
        Engine::Codex => capture(program, &["exec", "--help"]),
        Engine::Claude => capture(program, &["--help"]),
    }
    .unwrap_or_default();
    interpret(engine, &version, &help)
}

/// Runs a CLI for its own text, with the app's environment sanitised the same
/// way a turn's is. Both streams are read: Codex answers `--version` on stdout
/// and some builds report on stderr, and a probe that reads only one of them
/// concludes the CLI is missing.
fn capture(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    vibyra_core::launch_env::sanitize_command(&mut command);
    let output = wait_bounded(command)?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Some(text)
}

/// A CLI that hangs must not hang the probe. Nothing here is worth waiting on
/// for longer than it takes to print a version.
fn wait_bounded(mut command: Command) -> Option<std::process::Output> {
    use std::process::Stdio;

    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    loop {
        match child.try_wait().ok()? {
            Some(_) => return child.wait_with_output().ok(),
            None if std::time::Instant::now() > deadline => {
                let _ = child.kill();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
}
