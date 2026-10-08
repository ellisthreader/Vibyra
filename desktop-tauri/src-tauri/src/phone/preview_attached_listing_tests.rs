use super::*;

#[test]
fn reused_port_is_live_only_in_the_project_owning_its_listener() {
    let temp = tempfile::tempdir().unwrap();
    let other = temp.path().join("old-project");
    std::fs::create_dir(&other).unwrap();
    let actual = std::env::current_dir().unwrap().canonicalize().unwrap();
    let site = Site::bind(0, "current-project");
    let target = format!("attached-port:{}", site.port);
    let grants = Arc::new(PreviewGrants::load(temp.path().join("grants")).unwrap());
    grants.set_account(Some("user:fixture-account")).unwrap();
    grants.set_automatic("phone", false).unwrap();
    grants
        .grant_at("phone", "old", &other, &target, "/menu")
        .unwrap();
    grants
        .grant_at("phone", "current", &actual, &target, "/menu")
        .unwrap();
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![
            DesktopProject {
                id: "old".into(),
                name: "Old".into(),
                path: other.to_str().unwrap().into(),
            },
            DesktopProject {
                id: "current".into(),
                name: "Current".into(),
                path: actual.to_str().unwrap().into(),
            },
        ],
        vec![],
        None,
    );
    let service = PreviewService::new(PreviewManager::new(), grants, workspace);
    let listed = service.list("phone");
    let targets = listed["targets"].as_array().unwrap();
    assert_eq!(targets.len(), 2);
    assert_eq!(
        targets
            .iter()
            .find(|target| target["projectId"] == "old")
            .unwrap()["running"],
        false
    );
    assert_eq!(
        targets
            .iter()
            .find(|target| target["projectId"] == "current")
            .unwrap()["running"],
        true
    );
    site.stop();
    assert!(service.list("phone")["targets"]
        .as_array()
        .unwrap()
        .iter()
        .all(|target| target["running"] == false));
}
