//! Agent browser forms and takeover against the local test site.

use super::super::takeover;
use super::{home, launch, ref_of};
use serde_json::json;
use std::time::Duration;

#[test]
fn typing_refuses_passwords_and_a_submit_needs_the_approved_page() {
    let Some((mut s, site, _dir)) = launch("run-d") else {
        return;
    };
    let snap = s.open(&home(&site)).unwrap();
    assert_eq!(
        s.type_text(&ref_of(&snap, "Password"), "hunter3")
            .unwrap_err()
            .reason,
        "refused"
    );
    let typed = s.type_text(&ref_of(&snap, "To"), "b@example.com").unwrap();
    assert_eq!(typed["forms"][0]["fields"][0]["value"], "b@example.com");
    let form = &typed["forms"][0];
    let approved = json!({"ref": form["submits"][0]["ref"], "pageFingerprint": snap["pageFingerprint"],
        "destination": form["action"], "method": "POST"});
    assert_eq!(
        s.submit(&approved).unwrap_err().reason,
        "page_changed",
        "the stale fingerprint is refused"
    );
    assert!(site.find("POST", "/send").is_none());
    let approved = json!({"ref": form["submits"][0]["ref"], "pageFingerprint": typed["pageFingerprint"],
        "destination": form["action"], "method": "POST"});
    let done = s.submit(&approved).expect("the approved form submits");
    assert_eq!(done["submitted"], true);
    assert_eq!(done["title"], "Sent");
    assert_eq!(done["screenshotSha256"].as_str().unwrap().len(), 64);
    let hit = site
        .find("POST", "/send")
        .expect("the form reached the site once");
    assert!(hit.body.contains("to=b%40example.com"));
}

#[test]
fn takeover_pauses_automation_until_the_person_resumes() {
    let Some((mut s, site, _dir)) = launch("run-e") else {
        return;
    };
    s.open(&home(&site)).unwrap();
    s.takeover().unwrap();
    assert_eq!(s.snapshot().unwrap_err().reason, "paused");
    assert_eq!(s.open(&home(&site)).unwrap_err().reason, "paused");
    takeover::begin(
        None,
        "run-e",
        "action-1",
        "Sign in to the shop",
        "http://allowed.test",
    );
    assert_eq!(
        takeover::list()
            .iter()
            .filter(|t| t.run_id == "run-e")
            .count(),
        1
    );
    let resumer = std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(300));
        assert!(takeover::resume("run-e"));
    });
    assert!(takeover::wait("run-e", Duration::from_secs(10), || {}).is_ok());
    resumer.join().unwrap();
    takeover::end(None, "run-e");
    assert!(
        !takeover::resume("run-e"),
        "an ended takeover cannot be resumed"
    );
    s.resume();
    assert_eq!(s.snapshot().unwrap()["title"], "Shop");
}
