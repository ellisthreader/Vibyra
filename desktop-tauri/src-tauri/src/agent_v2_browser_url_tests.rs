use super::{clean, scrub, tokenish};
use serde_json::json;

#[test]
fn fragments_credentials_and_token_segments_never_survive() {
    let raw = "https://user:pw@app.example/cb/AbCdEf1234567890AbCdEf1234567890?page=2&access_token=ya29.x&code=1#access_token=ya29.SECRET&state=s";
    let out = clean(raw);
    for leak in ["ya29", "SECRET", "AbCdEf", "user", "pw@", "#"] {
        assert!(!out.contains(leak), "{out} leaked {leak}");
    }
    assert!(
        out.contains("page=2") && out.starts_with("https://app.example/cb/[redacted]"),
        "{out}"
    );
    assert_eq!(clean(&out), out, "cleaning is idempotent");
}

#[test]
fn ordinary_addresses_are_untouched() {
    for raw in [
        "https://example.com/",
        "https://example.com/blog/how-to-write-better-javascript-for-the-browser?page=3&sort=new",
        "https://example.com/docs/v2/getting-started#install",
        "about:blank",
    ] {
        let expected = raw.split('#').next().unwrap();
        assert_eq!(clean(raw), expected);
    }
    assert_eq!(clean("not an address"), "");
}

#[test]
fn opaque_query_values_are_redacted_even_under_innocent_names() {
    let out = clean("https://example.com/p?x=AbCdEf1234567890AbCdEf1234567890&y=fine");
    assert!(!out.contains("AbCdEf") && out.contains("y=fine"), "{out}");
}

#[test]
fn tokenish_separates_secrets_from_slugs() {
    for secret in [
        "eyJhbGciOiJIUzI1NiJ9",
        "AbCdEf1234567890AbCdEf1234567890xyz",
        "0123456789abcdef0123456789abcdef0123456789abcdef",
        "abcdefghijklmnopqrstuvwxyzabcdefghij",
    ] {
        assert!(tokenish(secret), "{secret}");
    }
    for plain in [
        "getting-started",
        "release-notes-2024",
        "internationalization",
        "v2",
        "how-to-write-better-javascript",
    ] {
        assert!(!tokenish(plain), "{plain}");
    }
}

#[test]
fn scrub_cleans_every_address_field_of_a_result() {
    let mut value = json!({"url": "https://a.test/x#access_token=t", "elements": [{"href": "https://a.test/y#frag", "name": "#keep"}],
        "forms": [{"action": "https://a.test/z?token=abc"}], "destination": "https://a.test/d#q", "title": "#not an address"});
    scrub(&mut value);
    let text = value.to_string();
    assert!(
        !text.contains("access_token")
            && !text.contains("#frag")
            && !text.contains("=abc")
            && !text.contains("/d#q"),
        "{text}"
    );
    assert_eq!(value["elements"][0]["name"], "#keep");
    assert_eq!(value["title"], "#not an address");
}
