//! F-02: method gating lives in CDP Fetch interception, which never sees
//! WebSocket frames, so page code must not be able to open sockets at all (in
//! any frame, dedicated, blob, shared or service worker), and a socket that
//! exists anyway makes clicks and typing need the person. Real headless Chrome
//! against a local site with a WebSocket echo endpoint.

use super::support::{page_js, title, wait_for};
use super::{home, launch, ref_of};
use serde_json::json;
use std::time::Duration;

const SOON: Duration = Duration::from_secs(10);

fn said(s: &super::Session, name: &str) -> Option<String> {
    page_js(s, &format!("window.{name} || null"))
        .as_str()
        .map(str::to_owned)
}

#[test]
fn page_code_cannot_open_a_websocket_or_event_source_anywhere() {
    let Some((mut s, site, _dir)) = launch("run-ws1") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/sockets", site.port))
        .unwrap();
    assert_eq!(page_js(&s, "typeof window.early"), json!("undefined"));
    // The click the model is allowed to make is a read; it must not send a message.
    s.click(&ref_of(&snap, "Send message"))
        .expect("the click itself is allowed");
    assert_eq!(title(&s), "blocked-SecurityError");
    s.click(&ref_of(&snap, "Frame")).unwrap();
    assert_eq!(
        title(&s),
        "blocked-SecurityError",
        "a fresh iframe's WebSocket is the same stub"
    );
    s.click(&ref_of(&snap, "Stream")).unwrap();
    assert_eq!(title(&s), "blocked-SecurityError");
    // srcdoc, sandboxed and cross-site (out-of-process) frames get the guard too.
    s.click(&ref_of(&snap, "Frames")).unwrap();
    let framed = wait_for(SOON, || {
        let said = page_js(&s, "window.framesSaid");
        said.as_array().filter(|a| a.len() >= 3).cloned()
    });
    let framed = framed.expect("three frames reported");
    let mut heard: Vec<String> = framed
        .iter()
        .map(|m| m.as_str().unwrap().to_owned())
        .collect();
    heard.sort();
    let want = [
        "cross-site-blocked-SecurityError",
        "sandbox-blocked-SecurityError",
        "srcdoc-blocked-SecurityError",
    ];
    assert_eq!(
        heard, want,
        "every frame, in-process or out-of-process, gets the guard"
    );
    for (name, want) in [
        ("workerSaid", "worker-blocked-SecurityError"),
        ("blobSaid", "blob-blocked-SecurityError"),
        ("sharedSaid", "worker-blocked-SecurityError"),
    ] {
        let got = wait_for(SOON, || said(&s, name));
        assert_eq!(
            got.as_deref(),
            Some(want),
            "{name}: workers get the guard before their first line"
        );
    }
    std::thread::sleep(Duration::from_millis(500));
    assert!(
        site.sockets().is_empty(),
        "a socket reached the site: {:?}",
        site.sockets()
    );
    assert!(
        site.find("GET", "/events").is_none(),
        "an EventSource reached the site"
    );
}

#[test]
fn a_service_worker_gets_no_websocket_either() {
    let Some((mut s, site, _dir)) = launch("run-ws2") else {
        return;
    };
    // `localhost` is a secure context, which service workers need.
    s.open(&format!("http://localhost:{}/sw-page", site.port))
        .unwrap();
    let got = wait_for(SOON, || said(&s, "swSaid"));
    assert_eq!(
        got.as_deref(),
        Some("sw-blocked-SecurityError"),
        "service worker said {got:?}"
    );
    std::thread::sleep(Duration::from_millis(500));
    assert!(
        site.sockets().is_empty(),
        "a socket reached the site: {:?}",
        site.sockets()
    );
}

/// A socket opened outside the page's own world (this isolated world has the
/// browser's real constructors), as if the guard had been bypassed.
fn open_native_socket(s: &super::Session, port: u16) {
    let tree = s
        .cdp
        .call("Page.getFrameTree", json!({}), Some(&s.page))
        .unwrap();
    let world = s
        .cdp
        .call(
            "Page.createIsolatedWorld",
            json!({"frameId": tree["frameTree"]["frame"]["id"], "worldName": "test-native"}),
            Some(&s.page),
        )
        .unwrap();
    let expression = format!("window.sock = new WebSocket('ws://allowed.test:{port}/sock')");
    s.cdp
        .call(
            "Runtime.evaluate",
            json!({"expression": expression, "contextId": world["executionContextId"]}),
            Some(&s.page),
        )
        .unwrap();
}

#[test]
fn a_live_socket_makes_clicks_and_typing_refuse_until_the_page_is_opened_again() {
    let Some((mut s, site, _dir)) = launch("run-ws3") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/", site.port))
        .unwrap();
    open_native_socket(&s, site.port);
    let opened = wait_for(SOON, || {
        site.sockets()
            .iter()
            .find(|h| h.method == "WS-OPEN")
            .cloned()
    });
    assert!(opened.is_some(), "the native socket connected");
    std::thread::sleep(Duration::from_millis(300));
    let click = s.click(&ref_of(&snap, "Next page")).unwrap_err();
    assert_eq!(click.reason, "refused");
    assert!(
        click.message.contains("live connection"),
        "{}",
        click.message
    );
    let typed = s
        .type_text(&ref_of(&snap, "To"), "x@example.com")
        .unwrap_err();
    assert_eq!(typed.reason, "refused");
    assert!(s.snapshot().is_ok(), "reading stays available");
    let snap = s.open(&home(&site)).unwrap();
    let next = s
        .click(&ref_of(&snap, "Next page"))
        .expect("a new document has no socket");
    assert_eq!(next["title"], "Next");
    assert!(
        site.sockets().iter().all(|h| h.method != "WS"),
        "no frame was ever sent"
    );
}
