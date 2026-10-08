//! Real, published servers at pinned versions. Needs network and npx/uvx, so it
//! is ignored by default: `cargo test -p vibyra-core local_mcp::tests_real -- --ignored`.

use super::tests_support::*;
use super::*;
use serde_json::json;
use std::collections::BTreeMap;

fn real(id: &str, command: &str, args: &[&str]) -> ServerSpec {
    ServerSpec {
        id: format!("real-{id}-0000"),
        name: id.into(),
        command: command.into(),
        args: args.iter().map(|a| a.to_string()).collect(),
        env: BTreeMap::new(),
        enabled: true,
        ..ServerSpec::default()
    }
}

#[test]
#[ignore = "needs network and npx"]
fn the_pinned_memory_and_filesystem_servers_work() {
    let sup = Supervisor::new(
        Limits::default(),
        std::sync::Arc::new(FakeKeychain::default()),
    );
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), "hello").unwrap();
    let folder = dir.path().to_string_lossy().into_owned();
    let memory = real(
        "memory",
        "npx",
        &["-y", "@modelcontextprotocol/server-memory@2026.8.31"],
    );
    assert_eq!(sup.list_tools(&memory).unwrap().len(), 9);
    assert!(!memory.unpinned_launcher());
    let files = real(
        "fs",
        "npx",
        &[
            "-y",
            "@modelcontextprotocol/server-filesystem@2026.8.31",
            &folder,
        ],
    );
    let read = sup
        .call_tool(
            &files,
            "read_text_file",
            &json!({"path": format!("{folder}/a.txt")}),
        )
        .unwrap();
    assert!(read.text.contains("hello"), "{read:?}");
    assert_eq!(sup.status(&files.id).era.as_deref(), Some("legacy"));
}

#[test]
#[ignore = "needs npm ci in backend/tests/integration/mcp-sdk"]
fn the_official_modern_only_sdk_server_works() {
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../backend/tests/integration/mcp-sdk/stdio.mjs");
    let server = real("official-sdk", "node", &[script.to_str().unwrap()]);
    let sup = Supervisor::new(
        Limits::default(),
        std::sync::Arc::new(FakeKeychain::default()),
    );
    let tools = sup.list_tools(&server).unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "hello");
    assert!(tools[0].read_only_hint);
    let receipt = sup.call_tool(&server, "hello", &json!({})).unwrap();
    assert_eq!(receipt.text, "official-sdk-modern-ok");
    assert_eq!(sup.status(&server.id).era.as_deref(), Some("modern"));
}
