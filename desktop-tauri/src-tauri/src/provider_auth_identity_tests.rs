use super::{jwt_claims, plan_name, product_detail, safe_label};
use base64::Engine;

fn token(payload: &str) -> String {
    format!(
        "header.{}.signature",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload)
    )
}

#[test]
fn reads_the_claims_out_of_a_token() {
    let claims = jwt_claims(&token(r#"{"email":"person@example.test"}"#)).unwrap();
    assert_eq!(claims["email"], "person@example.test");
}

/// Providers write their tokens unpadded, but a stored credential that has
/// been round-tripped through a padding encoder is still the same account.
#[test]
fn tolerates_padding_on_the_payload() {
    let payload = base64::engine::general_purpose::STANDARD.encode(r#"{"email":"a@b.test"}"#);
    let claims = jwt_claims(&format!("header.{payload}.signature")).unwrap();
    assert_eq!(claims["email"], "a@b.test");
}

#[test]
fn refuses_anything_that_is_not_a_token() {
    for value in ["", "not-a-token", "header.not-base64!.signature", "a.b.c"] {
        assert!(jwt_claims(value).is_none(), "{value}");
    }
}

#[test]
fn falls_back_when_the_provider_names_no_account() {
    assert_eq!(safe_label("  ", "ChatGPT account"), "ChatGPT account");
    assert_eq!(
        safe_label(" person@example.test ", "x"),
        "person@example.test"
    );
}

#[test]
fn plan_copy_is_product_scoped() {
    assert_eq!(product_detail("Claude", &plan_name("max")), "Claude Max");
    assert_eq!(
        product_detail("ChatGPT", &plan_name("edu_pro")),
        "ChatGPT Edu Pro"
    );
    assert_eq!(product_detail("Claude", ""), "Claude");
}
