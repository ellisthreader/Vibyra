//! Agent browser against a local test site in headless Chrome (a private temp
//! profile; never the person's own). Skipped when no Chromium is installed.
//! `allowed.test`/`blocked.test` resolve to 127.0.0.1 through the test
//! resolver; `internal.test` is granted but resolves to a loopback address
//! the local-address rule must refuse.

use super::chrome::Lease;
use super::policy::Policy;
use super::session::{Options, Session};
use super::takeover;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Duration;

#[path = "agent_v2_browser_tests_fingerprint.rs"]
mod fingerprint;
#[path = "agent_v2_browser_tests_forms.rs"]
mod forms;
#[path = "agent_v2_browser_tests_input.rs"]
mod input;
#[path = "agent_v2_browser_test_pages.rs"]
mod pages;
#[path = "agent_v2_browser_tests_pipe.rs"]
mod pipe_tests;
#[path = "agent_v2_browser_tests_proxy.rs"]
mod proxy_tests;
#[path = "agent_v2_browser_test_server.rs"]
mod server;
#[path = "agent_v2_browser_tests_sockets.rs"]
mod sockets;
#[path = "agent_v2_browser_tests_submit.rs"]
mod submit;
#[path = "agent_v2_browser_tests_support.rs"]
mod support;

fn launch(owner: &str) -> Option<(Session, server::Site, tempfile::TempDir)> {
    let binary = std::env::var_os("VIBYRA_TEST_CHROME")
        .map(Into::into)
        .or_else(super::chrome::find);
    let Some(binary) = binary else {
        eprintln!("skipped: no Chrome/Chromium on this computer");
        return None;
    };
    let site = server::start();
    let local: IpAddr = "127.0.0.1".parse().unwrap();
    let hosts = HashMap::from([
        ("allowed.test".to_owned(), (vec![local], true)),
        ("blocked.test".to_owned(), (vec![local], true)),
        ("internal.test".to_owned(), (vec![local], false)),
        ("localhost".to_owned(), (vec![local], true)),
    ]);
    let origins = [
        format!("http://allowed.test:{}", site.port),
        format!("http://internal.test:{}", site.port),
        format!("http://localhost:{}", site.port),
    ];
    let dir = tempfile::tempdir().unwrap();
    let options = Options {
        binary,
        profile: dir.path().join("profile"),
        owner: owner.into(),
        headless: true,
    };
    let session = Session::launch(&options, Policy::new(&origins).with_hosts(hosts))
        .expect("browser launches");
    Some((session, site, dir))
}

fn home(site: &server::Site) -> String {
    format!("http://allowed.test:{}/", site.port)
}

fn ref_of(snap: &Value, name: &str) -> String {
    snap["elements"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["name"].as_str().unwrap_or("").starts_with(name))
        .and_then(|e| e["ref"].as_str())
        .unwrap_or_else(|| panic!("no element {name} in {snap}"))
        .to_owned()
}

#[test]
fn an_allowed_page_loads_with_secrets_redacted_and_local_or_blocked_subresources_never_leave() {
    let Some((mut s, site, _dir)) = launch("run-a") else {
        return;
    };
    let snap = s.open(&home(&site)).expect("allowed origin opens");
    assert_eq!(snap["title"], "Shop");
    let text = snap.to_string();
    for secret in [
        "hunter2",
        "tok123",
        "sk-live-SECRET",
        "abcdefabcdefabcdefabcdef",
    ] {
        assert!(!text.contains(secret), "{secret} leaked into the snapshot");
    }
    let fields = &snap["forms"][0]["fields"];
    assert_eq!(fields[1]["value"], "[hidden]");
    assert_eq!(fields[2]["value"], "[hidden]");
    assert_eq!(snap["pageFingerprint"].as_str().unwrap().len(), 64);
    let read = s.read(0).unwrap().to_string();
    assert!(
        read.contains("Welcome")
            && !read.contains("sk-live-SECRET")
            && !read.contains("abcdefabcdefabcdefabcdef")
    );
    std::thread::sleep(Duration::from_millis(500));
    assert_eq!(
        site.hits_to("internal.test"),
        0,
        "a granted name that resolves to a local address is refused"
    );
    assert_eq!(
        site.hits_to("blocked.test"),
        0,
        "a subresource from another origin is refused"
    );
}

#[test]
fn a_blocked_origin_a_redirect_away_and_file_urls_are_stopped() {
    let Some((mut s, site, _dir)) = launch("run-b") else {
        return;
    };
    let blocked = format!("http://blocked.test:{}/", site.port);
    assert_eq!(s.open(&blocked).unwrap_err().reason, "origin_blocked");
    assert_eq!(
        s.open("file:///etc/passwd").unwrap_err().reason,
        "origin_blocked"
    );
    let redirect = s
        .open(&format!("http://allowed.test:{}/redirect", site.port))
        .unwrap_err();
    assert_eq!(redirect.reason, "origin_blocked", "{}", redirect.message);
    let snap = s.open(&home(&site)).unwrap();
    assert_eq!(
        s.click(&ref_of(&snap, "Away")).unwrap_err().reason,
        "origin_blocked"
    );
    assert_eq!(site.hits_to("blocked.test"), 0);
    let next = s
        .click(&ref_of(&snap, "Next page"))
        .expect("a same-site link works");
    assert_eq!(next["title"], "Next");
}

#[test]
fn popups_are_closed_and_clicks_cannot_send_data_or_submit() {
    let Some((mut s, site, _dir)) = launch("run-c") else {
        return;
    };
    let snap = s.open(&home(&site)).unwrap();
    s.click(&ref_of(&snap, "Pop")).unwrap();
    let snap = s.click(&ref_of(&snap, "Save")).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let pages = s.cdp.call("Target.getTargets", json!({}), None).unwrap()["targetInfos"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["type"] == "page")
        .count();
    assert_eq!(pages, 1, "the popup was closed");
    assert!(s.shared.popups.load(std::sync::atomic::Ordering::SeqCst) >= 1);
    assert!(
        site.find("GET", "/popup").is_none(),
        "the popup loaded nothing"
    );
    assert!(
        site.find("POST", "/api").is_none(),
        "an unapproved POST never left the browser"
    );
    assert!(
        snap.to_string()
            .contains("sending data needs browser_submit")
            || site.find("POST", "/api").is_none()
    );
    assert_eq!(
        s.click(&ref_of(&snap, "Send")).unwrap_err().reason,
        "refused"
    );
    assert!(site.find("POST", "/send").is_none());
}

#[test]
fn one_controller_per_profile() {
    let dir = tempfile::tempdir().unwrap();
    let lease = Lease::acquire(dir.path(), "run-1").unwrap();
    assert!(Lease::acquire(dir.path(), "run-2").is_err());
    drop(lease);
    assert!(Lease::acquire(dir.path(), "run-2").is_ok());
    assert!(takeover::wait("never-started", Duration::from_millis(50), || {}).is_err());
}
