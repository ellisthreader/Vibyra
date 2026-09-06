//! Asking the installed CLIs what they can do.
//!
//! Both engines are npm packages the user updates on their own schedule, and
//! both have moved flags inside a release series. Vibyra offers only controls
//! it has evidence for, so the answer comes from the CLI's own `--version` and
//! `--help` rather than from a table compiled into the app.
//!
//! Cached for sixty seconds, with an explicit recheck after a CLI update.

use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

use vibyra_core::agent_model::Engine;
use vibyra_core::agent_runtime::capabilities::interpret;
use vibyra_core::agent_runtime::EngineCapabilities;

type ProbeCache = Option<(std::time::Instant, Vec<EngineCapabilities>)>;
static CACHE: OnceLock<parking_lot::Mutex<ProbeCache>> = OnceLock::new();

pub fn invalidate() {
    *CACHE.get_or_init(|| parking_lot::Mutex::new(None)).lock() = None;
}

/// Both engines, with a short compatibility cache.
pub fn probe_engines() -> Vec<EngineCapabilities> {
    let mut cache = CACHE.get_or_init(|| parking_lot::Mutex::new(None)).lock();
    if let Some((time, capabilities)) = cache.as_ref() {
        if time.elapsed() < Duration::from_secs(60) {
            return capabilities.clone();
        }
    }
    let capabilities: Vec<_> = [Engine::Claude, Engine::Codex]
        .into_iter()
        .map(probe)
        .collect();
    *cache = Some((std::time::Instant::now(), capabilities.clone()));
    capabilities
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
    let mut capabilities = interpret(engine, &version, &help);
    if capabilities.structured
        && cfg!(target_os = "linux")
        && capture(
            "bwrap",
            &["--ro-bind", "/", "/", "--unshare-net", "--", "/bin/true"],
        )
        .is_none()
    {
        capabilities.blocker = "The Linux sandbox could not start. Install Bubblewrap and enable its distribution AppArmor profile on Ubuntu, then recheck the provider.".into();
        capabilities.structured = false;
    }
    if engine == Engine::Claude && capabilities.structured {
        if cfg!(target_os = "windows") {
            capabilities.blocker = "Claude Agent Mode needs a sandbox-capable worker. Use Codex on native Windows, or run Claude in WSL2.".into();
        } else if cfg!(target_os = "linux")
            && (capture("bwrap", &["--version"]).is_none() || capture("socat", &["-V"]).is_none())
        {
            capabilities.blocker = "Claude needs Bubblewrap and socat for protected execution. Install both, then recheck the provider.".into();
        }
        capabilities.structured = capabilities.blocker.is_empty();
    }
    capabilities
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
    if !output.status.success() {
        return None;
    }
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
