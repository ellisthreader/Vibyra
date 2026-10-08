use super::run_control::tests::fixture;
use super::*;
use serde_json::json;

#[test]
fn a_website_is_offered_and_requires_exact_command_approval() {
    let Some((dir, service, grants)) = fixture() else {
        return;
    };
    std::fs::write(
        dir.path().join("app/package.json"),
        r#"{"scripts":{"dev":"vite --host 127.0.0.1"},"dependencies":{"vite":"*"}}"#,
    )
    .unwrap();
    run_list::approvals_changed();
    let rows = service.runnable("phone");
    let site = rows
        .iter()
        .find(|row| row["kind"] == "web")
        .expect("website run card");
    assert_eq!(site["approvalRequired"], true);
    let params = json!({"projectId":"project","targetId":site["targetId"],"approve":true,"commandVersion":"stale"});
    assert_eq!(
        service.run("phone", &params).unwrap()["approvalRequired"],
        true
    );
    assert!(
        grants.list_for_device("phone").is_empty(),
        "listing or stale approval grants nothing"
    );
}

#[test]
fn static_website_run_opens_only_for_asking_phone_and_stop_revokes_it() {
    let Some((dir, service, grants)) = fixture() else {
        return;
    };
    std::fs::write(dir.path().join("app/package.json"), "{}").unwrap();
    std::fs::write(
        dir.path().join("app/index.html"),
        "<!doctype html><h1>Phone Run fixture</h1>",
    )
    .unwrap();
    run_list::approvals_changed();
    let rows = service.runnable("phone");
    let row = rows.iter().find(|row| row["kind"] == "web").unwrap();
    let result = service
        .run(
            "phone",
            &json!({"projectId":"project", "targetId":row["targetId"],
        "approve":true,"commandVersion":row["commandVersion"]}),
        )
        .unwrap();
    assert_eq!(result["runState"], "ready");
    let targets = service.list("phone");
    let target = targets["targets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|target| target["targetId"] == row["targetId"])
        .unwrap();
    let grant = target["grantId"].as_str().unwrap();
    assert!(service.open("another-phone", grant).is_err());
    assert!(service.open("phone", grant).is_ok());
    service
        .stop_run(
            "phone",
            &json!({"projectId":"project", "targetId":row["targetId"]}),
        )
        .unwrap();
    assert!(grants.list_for_device("phone").is_empty());
    assert!(service.open("phone", grant).is_err());
}
