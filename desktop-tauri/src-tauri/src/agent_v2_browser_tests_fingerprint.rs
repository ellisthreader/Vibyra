//! F-06: the `browser_submit` fingerprint binds the WHOLE page's forms (every
//! form and field, real values, hidden inputs, select options, checked state,
//! button name and value, destination), not the bounded summary the approval
//! card shows. Real headless Chrome; the page changes exactly as a hostile or
//! rewritten page could after the person approved.

use super::support::page_js;
use super::{launch, ref_of, Session};
use serde_json::{json, Value};

fn fingerprint(s: &mut Session) -> String {
    s.snapshot().unwrap()["pageFingerprint"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn approved(snap: &Value, form: usize) -> Value {
    let f = &snap["forms"][form];
    json!({"ref": f["submits"][0]["ref"], "pageFingerprint": snap["pageFingerprint"],
        "destination": f["action"], "method": "POST"})
}

#[test]
fn every_field_value_and_button_of_every_form_changes_the_fingerprint() {
    let Some((mut s, site, _dir)) = launch("run-fp1") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/big", site.port))
        .unwrap();
    let base = snap["pageFingerprint"].as_str().unwrap().to_owned();
    assert_eq!(
        fingerprint(&mut s),
        base,
        "an unchanged page has a stable fingerprint"
    );
    assert_eq!(
        snap["forms"].as_array().unwrap().len(),
        5,
        "the card summary is bounded"
    );
    assert_eq!(snap["forms"][0]["fields"].as_array().unwrap().len(), 20);
    let by_name = |n: &str| format!("document.getElementsByName('{n}')[0]");
    let changes = [
        (
            "field 23",
            format!("{}.value='EVIL'", by_name("f23")),
            format!("{}.value='v23'", by_name("f23")),
        ),
        (
            "hidden value",
            format!("{}.value='EVILHIDDEN'", by_name("h")),
            format!("{}.value='H1'", by_name("h")),
        ),
        (
            "option value",
            format!("{}.options[1].value='evil'", by_name("s")),
            format!("{}.options[1].value='b'", by_name("s")),
        ),
        (
            "selected option",
            format!("{}.selectedIndex=1", by_name("s")),
            format!("{}.selectedIndex=0", by_name("s")),
        ),
        (
            "checkbox",
            format!("{}.checked=true", by_name("c")),
            format!("{}.checked=false", by_name("c")),
        ),
        (
            "button value",
            format!("{}.value='EVIL'", by_name("go")),
            format!("{}.value='1'", by_name("go")),
        ),
        (
            "a form past the fifth",
            format!("{}.value='EVIL'", by_name("g7")),
            format!("{}.value='w7'", by_name("g7")),
        ),
        (
            "form action",
            "document.getElementById('main').action='/elsewhere'".into(),
            "document.getElementById('main').action='/send'".into(),
        ),
        (
            "form method",
            "document.getElementById('main').method='get'".into(),
            "document.getElementById('main').method='post'".into(),
        ),
        (
            "button formaction",
            format!("{}.setAttribute('formaction','/x')", by_name("go")),
            format!("{}.removeAttribute('formaction')", by_name("go")),
        ),
    ];
    for (what, change, revert) in changes {
        page_js(&s, &change);
        assert_ne!(
            fingerprint(&mut s),
            base,
            "{what} must change the fingerprint"
        );
        page_js(&s, &revert);
        assert_eq!(fingerprint(&mut s), base, "{what}: reverting restores it");
    }
}

#[test]
fn a_password_change_invalidates_the_approval_without_ever_being_shown() {
    let Some((mut s, site, _dir)) = launch("run-fp2") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/", site.port))
        .unwrap();
    let base = snap["pageFingerprint"].as_str().unwrap().to_owned();
    page_js(
        &s,
        "document.getElementsByName('pw')[0].value='rotated-pass-9'",
    );
    let after = s.snapshot().unwrap();
    assert_ne!(after["pageFingerprint"].as_str().unwrap(), base);
    let text = after.to_string();
    assert!(
        !text.contains("rotated-pass-9") && !text.contains("hunter2"),
        "{text}"
    );
    assert_eq!(after["forms"][0]["fields"][1]["value"], "[hidden]");
}

#[test]
fn an_approved_submit_is_refused_when_a_late_field_or_hidden_value_changes() {
    let Some((mut s, site, _dir)) = launch("run-fp3") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/big", site.port))
        .unwrap();
    let ok = approved(&snap, 0);
    ref_of(&snap, "Send all");
    page_js(&s, "document.getElementsByName('f23')[0].value='EVIL'");
    page_js(&s, "document.getElementsByName('h')[0].value='EVILHIDDEN'");
    assert_eq!(s.submit(&ok).unwrap_err().reason, "page_changed");
    assert!(site.find("POST", "/send").is_none(), "nothing was sent");
    page_js(&s, "document.getElementsByName('f23')[0].value='v23'");
    page_js(&s, "document.getElementsByName('h')[0].value='H1'");
    let done = s.submit(&ok).expect("the page the person approved submits");
    assert_eq!(done["submitted"], true);
    let body = site.find("POST", "/send").unwrap().body;
    assert!(
        body.contains("f23=v23") && body.contains("h=H1") && body.contains("go=1"),
        "{body}"
    );
    assert!(!body.contains("EVIL"), "{body}");
}
