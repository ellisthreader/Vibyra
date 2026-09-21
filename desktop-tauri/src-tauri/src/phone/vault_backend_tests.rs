use super::{backend::DesktopBackend, vault::Vault, workspace::SharedWorkspace};
use serde_json::json;
use std::sync::Arc;
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_host::Backend;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

/// The seam between `Vault` (tested alone in `vault.rs`) and the actual phone
/// entry point: this drives the calls exactly as the real wire would, through
/// `DesktopBackend::handle` itself, not by calling the vault or its Engine directly.
#[test]
fn a_chosen_vault_is_reachable_through_the_real_desktop_backend_and_nothing_else_is() {
    let root = tempfile::tempdir().unwrap();
    let state = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("Home.md"),
        "See the connector writes contract.\n",
    )
    .unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let vault = Vault::new(state.path().into());
    let vault_project = vault.choose(root.path().into()).unwrap();
    let backend = DesktopBackend::new(
        manager.clone(),
        SharedWorkspace::default(),
        Default::default(),
        vault,
        Default::default(),
    )
    .unwrap();

    // The vault shows up in host.state, marked filesAvailable, beside whatever
    // ordinary terminal-grouping folders exist (none here) which would not be.
    let host = backend.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(host["capabilities"]["vibesToolsV1"], true);
    let projects = host["projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["id"], vault_project["id"]);
    assert_eq!(projects[0]["filesAvailable"], true);
    assert_eq!(
        host["capabilities"]["readOnly"], true,
        "sessions are still view-only"
    );

    let project_id = vault_project["id"].as_str().unwrap().to_owned();
    let account_token = uuid::Uuid::new_v4().to_string();
    let chat_id = uuid::Uuid::new_v4().to_string();
    let bind = backend
        .handle(
            "phone",
            "vibes.bind",
            json!({"projectId":project_id,"chatId":chat_id,"accountToken":account_token}),
        )
        .unwrap();
    let mut call = json!({"projectId":project_id,"binding":bind["binding"],
        "chatId":chat_id,"accountToken":account_token,"toolId":uuid::Uuid::new_v4().to_string(),
        "decision":"allow","expiresAt":chrono::Utc::now().timestamp() + 900,"path":""});

    call["operation"] = json!("search_files");
    call["query"] = json!("connector writes contract");
    assert!(backend
        .handle("other-phone", "vibes.tool", call.clone())
        .is_err());
    let found = backend.handle("phone", "vibes.tool", call.clone()).unwrap();
    assert_eq!(found["matches"][0]["path"], "Home.md");

    call["toolId"] = json!(uuid::Uuid::new_v4().to_string());
    call["operation"] = json!("write_file");
    call["path"] = json!("Home.md");
    call["content"] = json!("replaced");
    call["expectedSha256"] = json!("new");
    let refused = backend.handle("phone", "vibes.tool", call).unwrap();
    assert!(
        refused["error"].is_string(),
        "a read-only vault must refuse writes even reached through the real adapter"
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("Home.md")).unwrap(),
        "See the connector writes contract.\n"
    );

    // A project id nothing chose is still refused, exactly as before the vault existed.
    assert!(backend
        .handle(
            "phone",
            "project.files",
            json!({"projectId":"not-a-real-project"})
        )
        .is_err());
    manager.shutdown();
}
