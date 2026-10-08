use super::{run_control::tests::fixture, *};
use serde_json::json;
use vibyra_host::{with_rpc_access, PreviewAccess};

struct Access(bool);
impl PreviewAccess for Access {
    fn permits(&self, permission: &str) -> bool {
        self.0 || permission == "preview:access"
    }
}

#[test]
fn manual_html_uses_exact_approval_serves_assets_and_revokes_on_stop() {
    let (dir, service, grants) = fixture().expect("npm fixture available");
    let folder = dir.path().join("app/design/mockups");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("hello world.html"), "<h1>Manual selection</h1>").unwrap();
    std::fs::write(folder.join("style.css"), "h1{color:blue}").unwrap();
    with_rpc_access(Arc::new(Access(true)), || {
        let listing = service
            .manual_files(&json!({"projectId":"project", "path":"design/mockups"}))
            .unwrap();
        assert_eq!(listing["entries"].as_array().unwrap().len(), 1);
        let result = service
            .manual_inspect(
                &json!({"projectId":"project", "path":"design/mockups/hello world.html"}),
                true,
            )
            .unwrap();
        let row = &result["runnable"][0];
        assert_eq!(row["runState"], "idle");
        assert!(grants.list_for_device("phone").is_empty());
        let mut params = json!({"projectId":"project", "targetId":row["targetId"], "manual":row["manual"], "approve":true, "commandVersion":"stale"});
        assert_eq!(
            service.run("phone", &params).unwrap()["approvalRequired"],
            true
        );
        params["commandVersion"] = row["commandVersion"].clone();
        assert_eq!(service.run("phone", &params).unwrap()["runState"], "ready");
        let target_id = row["targetId"].as_str().unwrap();
        let root = dir.path().join("app");
        let status = service
            .inner
            .manager
            .status(root.to_str().unwrap(), target_id)
            .unwrap();
        let url = status.url.unwrap();
        assert!(reqwest::blocking::get(&url)
            .unwrap()
            .text()
            .unwrap()
            .contains("Manual selection"));
        assert_eq!(
            reqwest::blocking::get(format!("{url}style.css"))
                .unwrap()
                .text()
                .unwrap(),
            "h1{color:blue}"
        );
        run_list::approvals_changed();
        assert!(service
            .runnable("phone")
            .iter()
            .any(|item| item["targetId"] == target_id));
        let grant = grants
            .list_for_device("phone")
            .into_iter()
            .find(|item| item.target_id == target_id)
            .unwrap()
            .id;
        assert!(service.open("another-phone", &grant).is_err());
        assert!(service.open("phone", &grant).is_ok());
        service.stop_run("phone", &params).unwrap();
        assert!(service.open("phone", &grant).is_err());
    });
}

#[test]
fn manual_browse_rejects_outside_paths_and_missing_file_permission() {
    let (dir, service, _) = fixture().expect("npm fixture available");
    std::fs::write(dir.path().join("outside.html"), "outside").unwrap();
    std::os::unix::fs::symlink(
        dir.path().join("outside.html"),
        dir.path().join("app/escape.html"),
    )
    .unwrap();
    with_rpc_access(Arc::new(Access(true)), || {
        for path in ["..", "../outside.html", "/tmp", "escape.html"] {
            assert!(
                service
                    .manual_inspect(&json!({"projectId":"project", "path":path}), true)
                    .is_err(),
                "{path}"
            );
        }
        assert!(service
            .manual_files(&json!({"projectId":"unknown"}))
            .is_err());
    });
    with_rpc_access(Arc::new(Access(false)), || {
        assert!(service
            .manual_files(&json!({"projectId":"project"}))
            .is_err());
        assert!(service
            .manual_inspect(&json!({"projectId":"project"}), true)
            .is_err());
    });
}

#[test]
fn manual_folder_bypasses_shallow_discovery_and_rechecks_changed_commands() {
    let (dir, service, _) = fixture().expect("npm fixture available");
    let folder = dir.path().join("app/design/one/two/three/site ü");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("index.html"), "deep site").unwrap();
    with_rpc_access(Arc::new(Access(true)), || {
        let result = service
            .manual_inspect(
                &json!({"projectId":"project", "path":"design/one/two/three/site ü"}),
                true,
            )
            .unwrap();
        let row = &result["runnable"][0];
        assert!(row["targetId"].as_str().unwrap().is_ascii());
        let params = json!({"projectId":"project", "targetId":row["targetId"], "manual":row["manual"], "approve":true, "commandVersion":row["commandVersion"]});
        std::fs::write(
            folder.join("package.json"),
            r#"{"scripts":{"dev":"vite"},"dependencies":{"vite":"*"}}"#,
        )
        .unwrap();
        assert!(
            service.run("phone", &params).is_err(),
            "changed target cannot launch the old selection"
        );
    });
}
