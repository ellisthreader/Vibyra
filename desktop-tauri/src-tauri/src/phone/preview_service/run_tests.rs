use super::PreviewService;
use crate::phone::{
    preview_grants::PreviewGrants,
    workspace::{DesktopProject, SharedWorkspace},
};
use serde_json::{json, Value};
use std::sync::Arc;
use vibyra_core::preview::PreviewManager;
use vibyra_engine::{RunOutcome, RunRequest};

const APP: &str = ".::desktop-desktop";

/// A project whose desktop app is `npm run desktop`, a stand-in that just
/// sleeps. None when this machine has no npm to run it with.
pub(in crate::phone::preview_service) fn fixture(
) -> Option<(tempfile::TempDir, PreviewService, Arc<PreviewGrants>)> {
    let npm = std::process::Command::new("npm").arg("--version").output();
    if !npm.is_ok_and(|output| output.status.success()) {
        return None;
    }
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("app");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::write(
        project.join("package.json"),
        r#"{"scripts":{"desktop":"sleep 30"}}"#,
    )
    .unwrap();
    let grants = Arc::new(PreviewGrants::load(dir.path().join("grants")).unwrap());
    grants.set_account(Some("owner")).unwrap();
    let workspace = SharedWorkspace::default();
    let path = project.display().to_string();
    let project = DesktopProject {
        id: "project".into(),
        name: "App".into(),
        path,
    };
    workspace.write().publish(vec![project], vec![], None);
    let service = PreviewService::new(PreviewManager::new(), grants.clone(), workspace);
    Some((dir, service, grants))
}

fn run(service: &PreviewService, extra: Value) -> Value {
    let mut params = json!({"projectId":"project","targetId":APP});
    params
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    service.run("phone", &params).unwrap()
}

fn stop(service: &PreviewService) {
    let _ = service.stop_run("phone", &json!({"projectId":"project","targetId":APP}));
}

#[test]
fn the_phone_runs_an_app_only_with_the_version_it_was_shown() {
    let Some((dir, service, _)) = fixture() else {
        return;
    };
    let listed = service.runnable("phone");
    assert_eq!(listed.len(), 1, "{listed:#?}");
    assert_eq!(listed[0]["approvalRequired"], true);
    assert_eq!(listed[0]["body"], "sleep 30");
    assert_eq!(listed[0]["runState"], "idle");

    let asked = run(&service, json!({}));
    assert_eq!(asked["approvalRequired"], true);
    let version = asked["commandVersion"].as_str().unwrap().to_owned();
    let stale = run(
        &service,
        json!({"approve":true,"commandVersion":"0000000000000000"}),
    );
    assert_eq!(
        stale["approvalRequired"], true,
        "a stale version never approves"
    );

    let started = run(&service, json!({"approve":true,"commandVersion":version}));
    assert_eq!(started["runState"], "building", "{started}");
    assert!(started["runId"].is_string());
    let listed = service.runnable("phone");
    assert_eq!(listed[0]["approvalRequired"], false);
    assert_eq!(listed[0]["runState"], "building");

    let stopped = service
        .stop_run("phone", &json!({"projectId":"project","targetId":APP}))
        .unwrap();
    assert_eq!(stopped["phase"], "stopped");
    assert_eq!(service.runnable("phone")[0]["runState"], "stopped");

    // Editing what the command runs asks the owner again.
    std::fs::write(
        dir.path().join("app/package.json"),
        r#"{"scripts":{"desktop":"sleep 31"}}"#,
    )
    .unwrap();
    super::super::run_list::approvals_changed();
    let changed = run(&service, json!({}));
    assert_eq!(changed["approvalRequired"], true);
    assert_eq!(changed["changed"], true);
}

#[test]
fn an_agent_waits_for_approval_then_runs_the_exact_plan_once() {
    let Some((_dir, service, _)) = fixture() else {
        return;
    };
    let request = RunRequest {
        device: "phone".into(),
        project: "project".into(),
        command: Some("npm run desktop".into()),
        ..Default::default()
    };
    let RunOutcome::NeedsApproval {
        token,
        command,
        body,
        ..
    } = service.agent_run(&request).unwrap()
    else {
        panic!("an unapproved command must wait for the owner");
    };
    assert_eq!(command, "npm run desktop");
    assert_eq!(body.as_deref(), Some("sleep 30"));

    let approved = RunRequest {
        approve_token: Some(token.clone()),
        ..request.clone()
    };
    let RunOutcome::Started(status) = service.agent_run(&approved).unwrap() else {
        panic!("the approved plan must start");
    };
    assert_eq!(status["runState"], "building");
    assert!(
        service
            .agent_run(&approved)
            .unwrap_err()
            .contains("expired"),
        "single use"
    );

    // Approved now: the next ask starts at once, for any of the account's devices.
    let again = RunRequest {
        device: "desktop".into(),
        ..request
    };
    assert!(matches!(
        service.agent_run(&again).unwrap(),
        RunOutcome::Started(_)
    ));
    stop(&service);
}

#[test]
fn only_desktop_apps_inside_the_project_can_be_run() {
    let Some((_dir, service, _)) = fixture() else {
        return;
    };
    for command in [
        "sh -c sleep",
        "npm run missing",
        "cargo run --manifest-path ../x",
    ] {
        let request = RunRequest {
            device: "phone".into(),
            project: "project".into(),
            command: Some(command.into()),
            ..Default::default()
        };
        assert!(
            service.agent_run(&request).is_err(),
            "{command} was accepted"
        );
    }
    let unknown = RunRequest {
        device: "phone".into(),
        project: "missing".into(),
        command: Some("npm run desktop".into()),
        ..Default::default()
    };
    assert!(service
        .agent_run(&unknown)
        .unwrap_err()
        .contains("not open"));
}
