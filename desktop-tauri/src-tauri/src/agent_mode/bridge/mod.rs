//! The permission bridge: this executable, run by Claude as an MCP server.
//!
//! Claude Code in `-p` mode cannot ask a person anything, so every tool it
//! cannot allow on its own is silently denied — which made a Standard agent
//! unable to run a single shell command. `--permission-prompt-tool` names an
//! MCP tool to consult instead, and that tool is Vibyra itself: the same
//! binary, started by Claude with `--permission-bridge`, forwarding each
//! question over a local socket to the running app, where it becomes a
//! Decision card. The answer travels back the same way, and Claude proceeds
//! or stops.
//!
//! Nothing here decides anything. It carries a question and an answer.

mod server;
#[cfg(test)]
mod server_tests;
pub mod wire;

/// Serves Claude on stdin/stdout until it closes the pipe, then exits.
///
/// Never returns to the caller's `println!`: stdout is the protocol channel,
/// and a stray newline after the last response would be a parse error for a
/// client that has not quite gone yet.
pub fn run_from_cli() -> ! {
    let outcome = match wire::Env::from_process() {
        Ok(env) => {
            let wire = wire::TcpWire::new(env.port);
            let stdin = std::io::stdin();
            let stdout = std::io::stdout();
            server::serve(&wire, &env, stdin.lock(), stdout.lock())
        }
        Err(reason) => {
            eprintln!("vibyra permission bridge: {reason}");
            Err(reason)
        }
    };
    std::process::exit(if outcome.is_ok() { 0 } else { 1 })
}

/// Whether this process was started to be the bridge.
pub fn requested() -> bool {
    std::env::args()
        .skip(1)
        .any(|arg| arg == "--permission-bridge")
}
