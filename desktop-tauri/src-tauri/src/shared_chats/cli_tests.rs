use super::fixture::fixture;
use serde_json::json;
use tauri::ipc::Channel;

#[test]
fn native_presentation_is_single_flight_private_and_closed_with_its_session() {
    let (_dir, chats, session) = fixture();
    let id = session["id"].as_str().unwrap();
    let first = chats
        .attach_cli(id, 30, 100, Channel::new(|_| Ok(())))
        .unwrap();
    let second = chats
        .attach_cli(id, 40, 120, Channel::new(|_| Ok(())))
        .unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(
        chats.sessions().unwrap().len(),
        1,
        "The phone must see one conversation"
    );
    for method in [
        "shared_cli_attach",
        "shared_cli_write",
        "shared_cli_resize",
        "shared_cli_visibility",
    ] {
        assert!(chats
            .remote("phone", method, json!({"sessionId":id}), true)
            .unwrap_err()
            .contains("unavailable"));
    }
    chats.cli_visibility(id, false).unwrap();
    assert_eq!(
        chats
            .local("conversation.snapshot", json!({"sessionId":id}))
            .unwrap()["processState"],
        "running"
    );
    chats
        .local("session.stop", json!({"sessionId":id}))
        .unwrap();
    assert!(chats.cli_write(id, "x").is_err());
    assert!(chats
        .attach_cli(id, 30, 100, Channel::new(|_| Ok(())))
        .is_err());
}
#[test]
fn removing_project_cleans_presentation_and_preserves_archive() {
    let (dir, chats, session) = fixture();
    let id = session["id"].as_str().unwrap();
    chats
        .attach_cli(id, 30, 100, Channel::new(|_| Ok(())))
        .unwrap();
    chats.remove_project("project").unwrap();
    assert!(chats.cli_write(id, "x").is_err());
    assert!(chats.sessions().unwrap().is_empty());
    assert!(dir.path().join("journal/engine.sqlite3").exists());
}
