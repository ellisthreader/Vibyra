//! Real portable provider fixtures. Node is an explicit CI dependency, not a shell shim.
use std::path::PathBuf;

pub fn node() -> PathBuf {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    std::fs::canonicalize(
        crate::agent_v2::claude_cmd::find_program(name)
            .expect("Node executable required for provider fixtures"),
    )
    .expect("absolute Node fixture executable")
}
