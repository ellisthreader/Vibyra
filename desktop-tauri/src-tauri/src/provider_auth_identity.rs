use std::path::Path;

use base64::Engine;
use serde_json::Value;

/// Who a connected provider account belongs to, and what it is paying for.
///
/// Empty fields mean the provider did not say, not that the account is not
/// connected — the row falls back to naming the product.
#[derive(Clone, Default)]
pub struct AccountIdentity {
    pub email: String,
    pub plan: String,
}

/// The headline of a connected row: the signed-in email, or a fallback that at
/// least names whose account it is.
pub fn safe_label(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(180).collect()
    }
}

/// The line under it: the product, plus the plan when the provider names one.
pub fn product_detail(product: &str, plan: &str) -> String {
    let plan = plan.trim();
    if plan.is_empty() {
        product.into()
    } else {
        format!("{product} {plan}")
    }
}

/// Turns a provider's plan slug into the words a person reads on their
/// invoice: `max` becomes `Max`, `edu_pro` becomes `Edu Pro`.
pub fn plan_name(slug: &str) -> String {
    slug.split(|character: char| character == '_' || character == '-' || character.is_whitespace())
        .filter(|word| !word.is_empty())
        .map(title_case)
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_case(value: &str) -> String {
    let mut characters = value.chars();
    characters
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
        .unwrap_or_default()
}

/// The claims a JWT carries, without checking its signature.
///
/// The token was written by the provider's own CLI into a file only its owner
/// can read, and nothing here is authorized by it — it is read to find out
/// which account is already signed in. Verifying it would mean shipping the
/// provider's rotating public keys to guard a value against the person it
/// belongs to.
pub fn jwt_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.trim_end_matches('='))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// A JSON file a provider CLI wrote. Missing and malformed are one answer
/// here: either way there is no account name to show, and the caller has
/// already decided whether the account is connected.
pub fn read_json_value(path: &Path) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

#[cfg(test)]
#[path = "provider_auth_identity_tests.rs"]
mod tests;
