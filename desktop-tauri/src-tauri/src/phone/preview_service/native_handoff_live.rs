use super::tests::fixture;
use super::*;
use crate::phone::workspace::DesktopProject;
use vibyra_host::PreviewHandler;
#[test]
#[ignore = "Run the synthetic native fixture in /private/tmp/vibyra-handoff-project first"]
fn real_native_handoff_discovers_approves_and_decodes_only_its_project_window() {
    use crate::phone::backend::PreviewControl;
    let (_dir, service) = fixture();
    let root = std::path::PathBuf::from("/private/tmp/vibyra-handoff-project");
    service.inner.workspace.write().publish(
        vec![
            DesktopProject {
                id: "project".into(),
                name: "Native fixture".into(),
                path: root.display().to_string(),
            },
            DesktopProject {
                id: "other".into(),
                name: "Other project".into(),
                path: "/private/tmp/vibyra-handoff-other".into(),
            },
        ],
        vec![],
        None,
    );
    let list = service.list_handoff("phone");
    let candidate = list["targets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| {
            t["name"]
                .as_str()
                .is_some_and(|name| name.contains("Vibyra Window Preview Fixture"))
        })
        .unwrap_or_else(|| panic!("Native fixture not discovered: {list}"));
    assert_eq!(candidate["projectId"], "project");
    assert_eq!(candidate["approvalRequired"], true);
    let token = candidate["grantId"].as_str().unwrap();
    assert!(service.open("phone", token).is_err());
    assert!(service.share_window("other-phone", token).is_err());
    assert!(service.list("phone")["targets"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(PreviewControl::list_windows(&service, "phone")["targets"]
        .as_array()
        .unwrap()
        .is_empty());
    let approved = service.share_window("phone", token).unwrap();
    assert!(approved["targetId"].as_str().unwrap().ends_with(":view"));
    let id = approved["grantId"].as_str().unwrap();
    let receiver = service.subscribe("phone");
    let generation = service.open("phone", id).unwrap()["generation"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let binding = service.binding("phone", generation).unwrap();
    let window = binding.window.as_ref().unwrap();
    assert!(!window.ready());
    let mut frame = Err("not yet".into());
    for _ in 0..30 {
        frame = window.frame();
        if frame.is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(frame.unwrap().starts_with(&[0xff, 0xd8]));
    assert!(
        !window.ready(),
        "Sending pixels must not claim the phone decoded them"
    );
    let receipt = crate::phone::preview_service_fixture_support::request(
        &service,
        &receiver,
        generation,
        90,
        (
            "POST",
            "/ready",
            std::collections::HashMap::from([("x-vibyra-window".into(), "1".into())]),
            &[],
        ),
    );
    assert_eq!(receipt.info["status"], 200);
    assert_eq!(
        service.agent_preview_status("phone", "project").unwrap()["firstFrameDecoded"],
        true
    );
    assert_eq!(
        service.agent_preview_status("phone", "other").unwrap()["firstFrameDecoded"],
        false
    );
    assert!(window
        .input(json!({"sequence":1,"kind":"key","key":"enter"}), &|| Ok(()))
        .is_err());
    service
        .inner
        .grants
        .revoke(
            "phone",
            "project",
            &root,
            approved["targetId"].as_str().unwrap(),
        )
        .unwrap();
    assert!(service.binding("phone", generation).is_err());
    assert_eq!(
        service.agent_preview_status("phone", "project").unwrap()["firstFrameDecoded"],
        false
    );
    PreviewControl::close(&service, "phone", generation);
}
