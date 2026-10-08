//! F-08: the Agent browser is driven over `--remote-debugging-pipe`; no TCP
//! debugging port (a local, unauthenticated way into the browser and its
//! cookies) exists. Evidence comes from the real process tree: the listening
//! TCP sockets and their owning pids from `netstat -anv` (`lsof` hangs in the
//! sandboxes this runs in).

use super::launch;
use serde_json::json;
use std::process::Command;
#[path = "agent_v2_browser_tests_netstat.rs"]
mod netstat;

fn run(program: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(program).args(args).output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// The process and everything it started (renderer, GPU, network helpers).
fn tree(root: u32) -> Vec<u32> {
    let table = run("ps", &["-axo", "pid=,ppid="]).unwrap_or_default();
    let pairs: Vec<(u32, u32)> = table
        .lines()
        .filter_map(|l| {
            let mut parts = l.split_whitespace().map(|p| p.parse::<u32>().ok());
            Some((parts.next()??, parts.next()??))
        })
        .collect();
    let mut found = vec![root];
    let mut i = 0;
    while i < found.len() {
        let parent = found[i];
        found.extend(pairs.iter().filter(|(_, p)| *p == parent).map(|(c, _)| *c));
        i += 1;
    }
    found
}

/// `address pid` for every listening TCP socket owned by one of `pids`.
fn listeners(pids: &[u32]) -> Result<Vec<String>, String> {
    let out = Command::new("netstat")
        .args(["-anv", "-p", "tcp"])
        .output()
        .map_err(|e| format!("netstat failed: {e}"))?;
    let table = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        return Err(format!(
            "netstat {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    netstat::listeners(&table, pids).map_err(|e| format!("{e}\nnetstat output:\n{table}"))
}

#[test]
fn chrome_is_driven_over_a_pipe_and_opens_no_local_debugging_port() {
    let Some((s, _site, dir)) = launch("run-pipe") else {
        return;
    };
    let version = s.cdp.call("Browser.getVersion", json!({}), None).unwrap();
    assert!(version["product"].as_str().unwrap().contains("Chrome"));
    assert!(!dir.path().join("profile/DevToolsActivePort").exists());
    let pid = s.chrome_pid();
    if cfg!(windows) {
        eprintln!("skipped the command-line check: ps is Unix only");
        return;
    }
    let command = run("ps", &["-o", "command=", "-p", &pid.to_string()]).unwrap_or_default();
    assert!(command.contains("--remote-debugging-pipe"), "{command}");
    assert!(!command.contains("--remote-debugging-port"), "{command}");
    if !cfg!(target_os = "macos") {
        eprintln!("skipped the socket listing: its netstat syntax is macOS (BSD) only");
        return;
    }
    // The listing must see a listener we open ourselves (positive control).
    let own = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = own.local_addr().unwrap().port();
    let mine = listeners(&[std::process::id()]).expect("known-listener netstat observation");
    assert!(
        mine.iter().any(|l| l.contains(&format!(".{port} "))),
        "netstat did not show a known listener: {mine:?}; raw output: {}",
        run("netstat", &["-anv", "-p", "tcp"]).unwrap_or_default()
    );
    let processes = tree(pid);
    assert!(
        processes.len() > 1,
        "the browser's helper processes are in the tree"
    );
    let chrome = listeners(&processes).unwrap();
    eprintln!(
        "F-08 evidence: {} Chrome processes, TCP LISTEN sockets owned by them: {chrome:?}",
        processes.len()
    );
    assert!(
        chrome.is_empty(),
        "Chrome listens on a TCP port: {chrome:?}"
    );
}
