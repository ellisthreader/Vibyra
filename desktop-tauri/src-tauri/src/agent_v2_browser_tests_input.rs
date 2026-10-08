//! F-15: typing follows the field the model chose, never a focus handler's
//! redirect into a password, and fields named like identity or bank numbers
//! are secrets. Real headless Chrome.

use super::support::page_js;
use super::{launch, ref_of};
use serde_json::json;

#[test]
fn typing_never_follows_an_onfocus_handler_into_a_password_field() {
    let Some((mut s, site, _dir)) = launch("run-in1") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/focus", site.port))
        .unwrap();
    let refusal = s.type_text(&ref_of(&snap, "Name"), "hunter3").unwrap_err();
    assert_eq!(refusal.reason, "refused");
    assert_eq!(
        page_js(&s, "document.getElementById('pw').value"),
        json!("")
    );
    assert_eq!(page_js(&s, "document.getElementById('a').value"), json!(""));
}

#[test]
fn fields_named_like_identity_and_bank_numbers_are_secret() {
    let Some((mut s, site, _dir)) = launch("run-in2") else {
        return;
    };
    let snap = s
        .open(&format!("http://allowed.test:{}/focus", site.port))
        .unwrap();
    let text = snap.to_string();
    assert!(
        !text.contains("078-05-1120") && !text.contains("GB82WEST"),
        "{text}"
    );
    for name in ["ssn", "iban"] {
        let refusal = s.type_text(&ref_of(&snap, name), "1234").unwrap_err();
        assert_eq!(refusal.reason, "refused", "{name}");
    }
}

#[test]
fn reading_a_page_needs_its_site_to_be_granted_still() {
    let Some((mut s, site, _dir)) = launch("run-in3") else {
        return;
    };
    s.open(&format!("http://allowed.test:{}/", site.port))
        .unwrap();
    assert!(s.read(0).is_ok());
    // The grant changed to other sites while this page stayed open.
    s.policy
        .set_origins(&["https://elsewhere.example".to_owned()]);
    assert_eq!(s.read(0).unwrap_err().reason, "origin_blocked");
    assert_eq!(s.snapshot().unwrap_err().reason, "origin_blocked");
}
