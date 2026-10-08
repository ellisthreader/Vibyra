//! F-09: a page address can carry a secret: an implicit-flow return
//! (`/cb#access_token=...`), a magic link or reset token in the path, a key in
//! the query. The page script already cleans every address it reports; this
//! is the second line, applied to everything that leaves the Mac for the model,
//! the journal or a receipt. The fragment is always dropped, credentials are
//! dropped, token-like path segments and query values are redacted.

use serde_json::Value;

const SECRET_KEYS: [&str; 28] = [
    "token",
    "code",
    "session",
    "key",
    "secret",
    "pass",
    "pwd",
    "auth",
    "sig",
    "state",
    "jwt",
    "bearer",
    "credential",
    "otp",
    "nonce",
    "csrf",
    "xsrf",
    "ticket",
    "magic",
    "reset",
    "verif",
    "hash",
    "cred",
    "login",
    "sso",
    "saml",
    "assertion",
    "cookie",
];
const URL_KEYS: [&str; 5] = ["url", "href", "action", "destination", "pageUrl"];
pub const REDACTED: &str = "[redacted]";

fn secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    SECRET_KEYS.iter().any(|word| key.contains(word)) || key == "sid" || key.ends_with("_sid")
}

/// Looks like a generated secret: a JWT, a long opaque run, or a mixed
/// letter-and-digit run (hashes, base64, random ids). Plain words and
/// hyphenated slugs are left alone.
pub fn tokenish(text: &str) -> bool {
    if text.starts_with("eyJ") && text.len() >= 16 {
        return true;
    }
    text.split(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '+' | '=' | '_')))
        .any(|run| {
            let digit = run.chars().any(|c| c.is_ascii_digit());
            let alpha = run.chars().any(|c| c.is_ascii_alphabetic());
            run.len() >= 32 || (run.len() >= 20 && digit && alpha)
        })
}

/// The address without anything secret in it (`""` when it is not an address).
pub fn clean(raw: &str) -> String {
    let Ok(mut url) = url::Url::parse(raw) else {
        return String::new();
    };
    url.set_fragment(None);
    let _ = url.set_username("");
    let _ = url.set_password(None);
    if let Some(segments) = url.path_segments() {
        let cleaned: Vec<String> = segments
            .map(|s| {
                if tokenish(s) {
                    REDACTED.to_owned()
                } else {
                    s.to_owned()
                }
            })
            .collect();
        url.set_path(&cleaned.join("/"));
    }
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if pairs.iter().any(|(k, v)| secret_key(k) || tokenish(v)) {
        let hidden = pairs.into_iter().map(|(k, v)| {
            let hide = secret_key(&k) || tokenish(&v) || v == REDACTED;
            (k, if hide { REDACTED.to_owned() } else { v })
        });
        url.query_pairs_mut().clear().extend_pairs(hidden);
    }
    url.into()
}

/// Cleans every address-valued field of a result in place.
pub fn scrub(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, inner) in map.iter_mut() {
                match inner {
                    Value::String(text) if URL_KEYS.contains(&key.as_str()) && !text.is_empty() => {
                        *text = clean(text);
                    }
                    other => scrub(other),
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(scrub),
        _ => {}
    }
}

#[cfg(test)]
#[path = "agent_v2_browser_url_tests.rs"]
mod tests;
