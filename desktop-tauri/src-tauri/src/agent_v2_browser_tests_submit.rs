//! F-10 (a submit receipt says only what was observed) and F-09 (fragments
//! and path tokens never leave the Mac). Real headless Chrome.

use super::super::exec::receipt;
use super::{launch, Session};
use serde_json::{json, Value};

fn open_form(s: &mut Session, port: u16, path: &str) -> Value {
    let snap = s
        .open(&format!("http://allowed.test:{port}{path}"))
        .unwrap();
    let form = &snap["forms"][0];
    json!({"ref": form["submits"][0]["ref"], "pageFingerprint": snap["pageFingerprint"],
        "destination": form["action"], "method": "POST"})
}

#[test]
fn a_disabled_submit_button_never_reports_submitted() {
    let Some((mut s, site, _dir)) = launch("run-sub1") else {
        return;
    };
    let approved = open_form(&mut s, site.port, "/disabled");
    let refusal = s.submit(&approved).unwrap_err();
    assert_eq!(refusal.reason, "not_submitted");
    assert!(
        !refusal.unknown,
        "nothing was sent, so the refusal is definite"
    );
    assert!(site.find("POST", "/send").is_none());
}

#[test]
fn a_click_the_page_swallowed_is_a_definite_not_sent_not_a_success() {
    let Some((mut s, site, _dir)) = launch("run-sub2") else {
        return;
    };
    let approved = open_form(&mut s, site.port, "/stopped-form");
    let receipt = receipt(s.submit(&approved));
    // The contract's definite "nothing was sent": submitted false and no `observed`.
    assert_eq!(receipt["submitted"], false, "{receipt}");
    assert!(
        receipt.get("observed").is_none() && receipt.get("error").is_none(),
        "{receipt}"
    );
    assert!(site.find("POST", "/send").is_none());
}

#[test]
fn an_error_answer_to_a_real_post_is_an_unknown_outcome_never_a_retry() {
    let Some((mut s, site, _dir)) = launch("run-sub3") else {
        return;
    };
    let approved = open_form(&mut s, site.port, "/broken-form");
    let refusal = s.submit(&approved).unwrap_err();
    assert!(
        refusal.unknown,
        "the POST reached the site: {}",
        refusal.message
    );
    assert!(refusal.message.contains("500"), "{}", refusal.message);
    assert!(
        site.find("POST", "/fail").is_some(),
        "the form really was posted"
    );
    let out = receipt(Err(refusal));
    assert_eq!(out["unknown"], true);
    assert!(
        out.get("observed").is_none(),
        "an unknown outcome claims nothing was observed"
    );
}

#[test]
fn a_confirmed_submit_reports_the_observed_outcome() {
    let Some((mut s, site, _dir)) = launch("run-sub4") else {
        return;
    };
    let approved = open_form(&mut s, site.port, "/");
    let done = s.submit(&approved).expect("the approved form submits");
    assert_eq!(done["submitted"], true);
    // `observed` is what the browser itself saw leave, the method and the approved destination.
    assert_eq!(
        done["observed"],
        json!({"method": "POST", "destination": approved["destination"]})
    );
    assert_eq!(done["destination"], approved["destination"]);
    assert!(done["url"].as_str().unwrap().ends_with("/send"));
    assert_eq!(
        site.hits
            .lock()
            .unwrap()
            .iter()
            .filter(|h| h.path == "/send")
            .count(),
        1
    );
}

#[test]
fn fragments_and_path_tokens_never_reach_snapshots_reads_or_receipts() {
    let Some((mut s, site, _dir)) = launch("run-url1") else {
        return;
    };
    let token = "AbCdEf1234567890AbCdEf1234567890xyz";
    let url = format!(
        "http://allowed.test:{}/reset/{token}?page=2&token=qqq#access_token=ya29.SECRETFRAG&state=zzz",
        site.port
    );
    let snap = s.open(&url).unwrap();
    let read = s.read(0).unwrap();
    for (what, value) in [
        ("snapshot", &snap),
        ("read", &read),
        ("receipt", &receipt(Ok(snap.clone()))),
    ] {
        let text = value.to_string();
        for leak in [
            "SECRETFRAG",
            "ya29",
            "access_token",
            token,
            "LINKSECRET",
            "qqq",
        ] {
            assert!(!text.contains(leak), "{what} leaked {leak}: {text}");
        }
        assert!(
            !value["url"].as_str().unwrap().contains('#'),
            "{what}: {}",
            value["url"]
        );
    }
    assert!(
        snap["url"].as_str().unwrap().contains("page=2"),
        "ordinary query values stay"
    );
}

#[test]
fn a_refused_submit_receipt_is_unknown_and_other_refusals_are_definite() {
    use super::super::unrecordable;
    let submit = unrecordable(&json!({"tool": "browser_submit", "kind": "write"}));
    assert_eq!(
        submit["unknown"], true,
        "the form may have been sent: {submit}"
    );
    let read = unrecordable(&json!({"tool": "browser_click", "kind": "read"}));
    assert!(read.get("unknown").is_none(), "{read}");
}

#[test]
fn a_lost_or_overloaded_receipt_is_retried_never_dropped_or_called_not_sent() {
    use super::super::transient;
    use crate::agent_v2::api::ApiError;
    assert!(transient(&ApiError::Network("down".into())));
    let refused = |status| ApiError::Refused {
        status,
        code: "x".into(),
        message: String::new(),
    };
    for status in [408, 429, 500, 502, 503] {
        assert!(transient(&refused(status)), "{status}");
    }
    for status in [401, 404, 409, 413, 422] {
        assert!(!transient(&refused(status)), "{status}");
    }
}
