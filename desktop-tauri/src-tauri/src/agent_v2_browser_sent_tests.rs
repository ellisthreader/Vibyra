use super::{judge, Sent, Verdict};

fn sent(method: &str, url: &str, kind: &str, status: Option<u16>) -> Sent {
    Sent {
        id: "1".into(),
        method: method.into(),
        url: url.into(),
        kind: kind.into(),
        status,
        failed: false,
    }
}

const SEND: &str = "http://shop.test/send";

fn confirmed(method: &str) -> Verdict {
    Verdict::Confirmed {
        method: method.into(),
    }
}

#[test]
fn nothing_sent_is_not_a_success() {
    assert_eq!(judge(SEND, "POST", &[]), Verdict::NotSent);
    let page = [sent("GET", "http://shop.test/", "Document", Some(200))];
    assert_eq!(judge(SEND, "POST", &page), Verdict::NotSent);
}

#[test]
fn a_post_to_the_destination_with_an_ok_answer_is_confirmed() {
    let log = [sent("POST", "http://shop.test/send", "Document", Some(200))];
    assert_eq!(judge(SEND, "POST", &log), confirmed("POST"));
    let redirected = [sent(
        "POST",
        "http://shop.test/send?x=1",
        "Document",
        Some(302),
    )];
    assert_eq!(judge(SEND, "POST", &redirected), confirmed("POST"));
}

#[test]
fn an_error_or_missing_answer_to_a_real_post_is_unknown() {
    for (status, reason) in [
        (Some(500), "unavailable"),
        (Some(422), "unavailable"),
        (None, "timeout"),
    ] {
        let log = [sent("POST", SEND, "Document", status)];
        match judge(SEND, "POST", &log) {
            Verdict::Unknown { reason: got, .. } => assert_eq!(got, reason),
            other => panic!("{other:?}"),
        }
    }
    let mut failed = sent("POST", SEND, "Document", Some(200));
    failed.failed = true;
    assert!(matches!(
        judge(SEND, "POST", &[failed]),
        Verdict::Unknown { .. }
    ));
}

#[test]
fn data_sent_somewhere_else_on_the_site_is_unknown_not_a_confirmation() {
    let log = [sent(
        "POST",
        "http://shop.test/api/other",
        "Fetch",
        Some(200),
    )];
    assert!(matches!(judge(SEND, "POST", &log), Verdict::Unknown { .. }));
}

#[test]
fn a_get_form_counts_its_document_navigation_and_redacted_path_segments_match() {
    let log = [sent(
        "GET",
        "http://shop.test/search?q=a",
        "Document",
        Some(200),
    )];
    assert_eq!(
        judge("http://shop.test/search", "GET", &log),
        confirmed("GET")
    );
    let asset = [sent("GET", "http://shop.test/search", "Image", Some(200))];
    assert_eq!(
        judge("http://shop.test/search", "GET", &asset),
        Verdict::NotSent
    );
    let token = [sent(
        "POST",
        "http://shop.test/reset/AbCd1234AbCd1234AbCd1234",
        "Document",
        Some(200),
    )];
    assert_eq!(
        judge("http://shop.test/reset/[redacted]", "POST", &token),
        confirmed("POST")
    );
}
