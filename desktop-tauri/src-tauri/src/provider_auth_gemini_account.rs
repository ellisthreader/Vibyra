use std::path::Path;

use serde_json::Value;

use crate::provider_auth_identity::{jwt_claims, read_json_value};

/// The Google account the Gemini CLI is signed in as.
///
/// The CLI caches it in `google_accounts.json` once a sign-in completes.
/// Credentials written before that file existed only carry the id token, so
/// fall back to the email claim inside it.
///
/// There is no plan to read: Gemini's tier comes back from a Code Assist call
/// at runtime and is never written to disk, so the row names the product.
pub fn email(home: &Path) -> String {
    active_account(home)
        .or_else(|| credential_email(home))
        .unwrap_or_default()
}

fn active_account(home: &Path) -> Option<String> {
    let accounts = read_json_value(&home.join("google_accounts.json"))?;
    accounts
        .get("active")
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn credential_email(home: &Path) -> Option<String> {
    let credentials = read_json_value(&home.join("oauth_creds.json"))?;
    let claims = jwt_claims(credentials.get("id_token").and_then(Value::as_str)?)?;
    claims
        .get("email")
        .and_then(Value::as_str)
        .map(str::to_owned)
}
