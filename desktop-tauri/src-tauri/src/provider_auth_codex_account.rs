use std::path::Path;

use serde_json::Value;

use crate::provider_auth_identity::{jwt_claims, plan_name, read_json_value, AccountIdentity};

/// The claim OpenAI hangs its ChatGPT account facts off, namespaced by URL.
const AUTH_CLAIM: &str = "https://api.openai.com/auth";

/// Who is signed in to the ChatGPT CLI, read from the credentials it wrote.
///
/// `codex login status` reports only *that* an account is connected — one
/// line, no email, no plan, and no `--json` to ask for more. The id token it
/// stores beside that status carries both, so this reads the account out of
/// the file the CLI already keeps rather than inventing a second sign-in.
///
/// Takes the folder rather than finding it, because which folder it is depends
/// on which account is being asked about — see `provider_auth_home`.
pub fn identity_in(home: &Path) -> AccountIdentity {
    let Some(auth) = read_json_value(&home.join("auth.json")) else {
        return AccountIdentity::default();
    };
    let claims = auth
        .pointer("/tokens/id_token")
        .and_then(Value::as_str)
        .and_then(jwt_claims);
    let Some(claims) = claims else {
        return AccountIdentity::default();
    };
    AccountIdentity {
        email: claims
            .get("email")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        plan: chatgpt_plan(
            claims
                .get(AUTH_CLAIM)
                .and_then(|auth| auth.get("chatgpt_plan_type"))
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
    }
}

/// The plan slugs whose shape does not survive a plain title case. OpenAI
/// writes some as one word (`prolite`) and some with the billing arrangement
/// attached (`self_serve_business_usage_based`); neither is what the plan is
/// called on the account page. Anything unrecognised still reads as words.
fn chatgpt_plan(slug: &str) -> String {
    match slug.trim() {
        "" => String::new(),
        "prolite" => "Pro Lite".into(),
        "self_serve_business_prolite" => "Business Pro Lite".into(),
        "self_serve_business" | "self_serve_business_usage_based" => "Business".into(),
        "ent26" | "hc" | "enterprise_cbp_automation" | "enterprise_cbp_usage_based" => {
            "Enterprise".into()
        }
        "edu" | "education" => "Education".into(),
        "edu_pro" => "Education Pro".into(),
        other => plan_name(other),
    }
}

#[cfg(test)]
#[path = "provider_auth_codex_account_tests.rs"]
mod tests;
