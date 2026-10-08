use super::super::support::*;
use super::*;
use serde_json::json;
use std::sync::Arc;
use vibyra_core::local_mcp::{Limits, McpError};
use vibyra_core::secret_guard::allow::set_allowed;

fn job(arguments: serde_json::Value, is_write: bool) -> Job {
    Job {
        local_id: "s".into(),
        connection_id: CONN.into(),
        remote_name: "read_file".into(),
        arguments,
        is_write,
    }
}

/// A server whose program does not exist: reaching it fails with `Spawn`, a refusal with `Invalid`.
fn unreachable_server(folder: &Path) -> ServerSpec {
    ServerSpec {
        id: "guard-server-0001".into(),
        name: "Guard test".into(),
        command: "/nonexistent/vibyra-test-server".into(),
        args: vec![folder.to_string_lossy().into_owned()],
        enabled: true,
        ..ServerSpec::default()
    }
}

fn supervisor() -> Arc<Supervisor> {
    Supervisor::new(Limits::default(), Arc::new(NoSecrets))
}

#[test]
fn a_sensitive_path_is_refused_before_the_server_is_touched() {
    let (settings, project) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let spec = unreachable_server(project.path());
    let sup = supervisor();
    for write in [false, true] {
        let refused = call(
            &sup,
            settings.path(),
            &spec,
            &job(json!({"path": ".env"}), write),
            true,
        );
        let error = refused.unwrap_err();
        assert!(matches!(error, McpError::Invalid(_)), "{error:?}");
        // A refusal is a plain refusal, never an "unknown outcome" for a write.
        let receipt = super::super::map::receipt(Err(error), write);
        assert!(receipt.get("unknown").is_none());
    }
    let normal = call(
        &sup,
        settings.path(),
        &spec,
        &job(json!({"path": "src/main.rs"}), false),
        true,
    );
    assert!(
        !matches!(normal, Err(McpError::Invalid(_))),
        "a normal file reaches the server"
    );
}

#[test]
fn with_the_guard_off_nothing_changes() {
    let (settings, project) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let spec = unreachable_server(project.path());
    let off = call(
        &supervisor(),
        settings.path(),
        &spec,
        &job(json!({"path": ".env"}), false),
        false,
    );
    assert!(!matches!(off, Err(McpError::Invalid(_))));
}

#[test]
fn an_allowed_folder_reaches_the_server() {
    let (settings, project) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    set_allowed(settings.path(), project.path().to_str().unwrap(), true).unwrap();
    let spec = unreachable_server(project.path());
    let allowed = call(
        &supervisor(),
        settings.path(),
        &spec,
        &job(json!({"path": "id_rsa"}), false),
        true,
    );
    assert!(!matches!(allowed, Err(McpError::Invalid(_))));
}
