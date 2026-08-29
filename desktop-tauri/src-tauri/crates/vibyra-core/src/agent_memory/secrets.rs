//! The one thing memory refuses to hold.
//!
//! An agent that helpfully remembers an API key has built a plaintext
//! credential store with a search box. No budget, approval flow or reflection
//! mode makes that acceptable, so the refusal is here — below the reflection
//! policy and below the store — where every path to a stored entry has to pass
//! through it, including the user typing one in by hand.
//!
//! This is a filter, not a guarantee. It catches the shapes credentials
//! actually have; it cannot catch a password that looks like a sentence. That
//! is why it is one layer among several and not the only one.

/// Prefixes that are unambiguously a credential in the wild.
const TOKEN_PREFIXES: &[&str] = &[
    "sk-",
    "sk_live_",
    "sk_test_",
    "pk_live_",
    "rk_live_",
    "ghp_",
    "gho_",
    "ghu_",
    "ghs_",
    "ghr_",
    "github_pat_",
    "xoxb-",
    "xoxp-",
    "xoxa-",
    "AKIA",
    "ASIA",
    "AIza",
    "ya29.",
    "glpat-",
    "npm_",
    "dop_v1_",
    "shpat_",
    "SG.",
    "hf_",
];

/// Words that name a secret when they sit next to an assignment.
const SECRET_WORDS: &[&str] = &[
    "api key",
    "apikey",
    "api_key",
    "access token",
    "access_token",
    "secret key",
    "secret_key",
    "client_secret",
    "private key",
    "private_key",
    "password",
    "passwd",
    "credential",
    "bearer ",
];

/// Whether `text` looks like it carries a credential.
///
/// Deliberately eager on the assignment shape (`password: hunter2`) and
/// deliberately quiet on the descriptive one (`the API key lives in the
/// keyring`), because the second is exactly the kind of durable fact memory is
/// for and refusing it would train the user to work around this check.
pub fn looks_like_a_secret(text: &str) -> bool {
    let lower = text.to_lowercase();
    if text.contains("-----BEGIN") && text.contains("PRIVATE KEY") {
        return true;
    }
    if TOKEN_PREFIXES
        .iter()
        .any(|prefix| carries_token(text, prefix))
    {
        return true;
    }
    SECRET_WORDS
        .iter()
        .any(|word| lower.contains(word) && assigns_a_value(&lower, word))
}

/// A prefix only counts when enough opaque characters follow it to be a real
/// token. `sk-` in prose is two letters and a dash.
fn carries_token(text: &str, prefix: &str) -> bool {
    text.match_indices(prefix).any(|(index, _)| {
        let tail = &text[index + prefix.len()..];
        let run = tail
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
            .count();
        run >= 16
    })
}

/// Whether a secret word is followed by something that looks like a value
/// rather than by more prose.
///
/// The separator has to be an assignment (`:`, `=`, `is`) and what follows has
/// to be a long unbroken run — the shape of a token, not of a sentence.
fn assigns_a_value(lower: &str, word: &str) -> bool {
    let Some(index) = lower.find(word) else {
        return false;
    };
    let tail = lower[index + word.len()..].trim_start();
    let tail = tail
        .strip_prefix(':')
        .or_else(|| tail.strip_prefix('='))
        .or_else(|| tail.strip_prefix("is "))
        .or_else(|| tail.strip_prefix("was "))
        .map(str::trim_start);
    let Some(value) = tail else {
        return false;
    };
    let run = value
        .chars()
        .take_while(|c| !c.is_whitespace())
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '+' | '/'))
        .count();
    run >= 8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_the_shapes_credentials_actually_have() {
        for secret in [
            "sk-proj-AbCdEfGhIjKlMnOpQrStUvWx1234",
            "ghp_16CharsAndThenSomeMoreHere00",
            "the password: hunter2andthensome",
            "AWS key AKIAIOSFODNN7EXAMPLE0000",
            "-----BEGIN RSA PRIVATE KEY-----",
            "client_secret=abcdefghijklmnop",
        ] {
            assert!(looks_like_a_secret(secret), "missed: {secret}");
        }
    }

    /// The half that matters just as much: a durable fact *about* credentials
    /// is exactly what memory is for, and refusing it would teach the user to
    /// phrase around the check.
    #[test]
    fn allows_talking_about_credentials_without_carrying_one() {
        for fine in [
            "The API key lives in the OS keyring, never in settings.",
            "Ask for the password rather than storing it.",
            "Deploys use a token from CI; it is not in the repo.",
            "sk- prefixed keys are OpenAI's shape.",
            "Rotate the private key every quarter.",
        ] {
            assert!(!looks_like_a_secret(fine), "false positive: {fine}");
        }
    }
}
