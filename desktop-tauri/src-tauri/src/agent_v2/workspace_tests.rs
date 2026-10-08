//! A run folder is empty, private (0700 folders, 0600 credential files), lives under
//! the private base when one is set, and is fully removed.

use super::*;
use serde_json::json;

#[test]
fn a_run_folder_is_empty_private_and_fully_removed() {
    let config = BrokerConfig {
        base: "http://127.0.0.1:1".into(),
        runtime_id: "r".into(),
        key: "k".into(),
        run_id: "run".into(),
        generation: 1,
        manifest: json!({"tools": []}),
        armed_path: None,
    };
    let workspace = Workspace::create_in(
        None,
        Path::new("/Applications/Vibyra.app/Contents/MacOS/vibyra"),
        &config,
    )
    .unwrap();
    assert_eq!(std::fs::read_dir(&workspace.work).unwrap().count(), 0);
    let mcp: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&workspace.mcp_config).unwrap()).unwrap();
    let server = &mcp["mcpServers"]["vibyra-broker"];
    assert_eq!(server["args"], json!(["--agent-v2-broker"]));
    assert!(!mcp.to_string().contains("\"t\""), "no secrets in mcp.json");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(workspace.mcp_config.with_file_name("broker.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        let folder = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        let root = workspace.work.parent().unwrap();
        for private in [root, &root.join("ctl"), &root.join("attachments")] {
            assert_eq!(folder(private), 0o700, "{private:?} is for this user only");
        }
        workspace.keep_alive();
        assert!(root.join("ctl").join("alive").exists());
    }
    let saved: BrokerConfig = serde_json::from_str(
        &std::fs::read_to_string(workspace.mcp_config.with_file_name("broker.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        saved.armed_path.as_deref(),
        Some(workspace.armed.to_str().unwrap())
    );
    let claude = tempfile::tempdir().unwrap();
    let memory = claude
        .path()
        .join("projects")
        .join(project_dir_name(&workspace.work))
        .join("memory");
    std::fs::create_dir_all(&memory).unwrap();
    let other = claude.path().join("projects").join("-Users-me-project");
    std::fs::create_dir_all(&other).unwrap();
    let root = workspace.work.parent().unwrap().to_path_buf();
    workspace.cleanup(&[claude.path().to_path_buf()]);
    assert!(!root.exists());
    assert!(!memory.parent().unwrap().exists());
    assert!(other.exists(), "other projects' memory is untouched");
}

#[test]
fn a_private_base_holds_the_run_folder_and_is_itself_private() {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().join("agent-runs");
    let config = BrokerConfig {
        base: "http://127.0.0.1:1".into(),
        runtime_id: "r".into(),
        key: "k".into(),
        run_id: "run".into(),
        generation: 1,
        manifest: json!({"tools": []}),
        armed_path: None,
    };
    let workspace = Workspace::create_in(Some(&base), Path::new("/x/vibyra"), &config).unwrap();
    let root = workspace.work.parent().unwrap().to_path_buf();
    assert!(
        root.starts_with(base.canonicalize().unwrap()),
        "{root:?} is under {base:?}"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&base).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o700,
            "the folder that holds run folders is for this user only"
        );
    }
    workspace.cleanup(&[]);
    assert!(!root.exists() && base.exists());
}
