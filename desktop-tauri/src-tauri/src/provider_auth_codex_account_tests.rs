use super::{chatgpt_plan, identity_in};
use base64::Engine;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static FIXTURE_ID: AtomicU64 = AtomicU64::new(1);

struct TestHome(PathBuf);

impl TestHome {
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestHome {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn token(payload: serde_json::Value) -> String {
    format!(
        "header.{}.signature",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
    )
}

fn home(auth: serde_json::Value) -> TestHome {
    let id = FIXTURE_ID.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("vibyra-codex-auth-{}-{id}", std::process::id()));
    fs::create_dir(&path).unwrap();
    fs::write(path.join("auth.json"), auth.to_string()).unwrap();
    TestHome(path)
}

/// The whole point of the change: the CLI only says "Logged in using ChatGPT",
/// so the email and the plan have to come out of the token beside it.
#[test]
fn reads_the_email_and_plan_out_of_the_stored_token() {
    let home = home(json!({
        "auth_mode": "chatgpt",
        "tokens": {
            "id_token": token(json!({
                "email": "person@example.test",
                "https://api.openai.com/auth": { "chatgpt_plan_type": "prolite" },
            })),
        },
    }));
    let identity = identity_in(home.path());
    assert_eq!(identity.email, "person@example.test");
    assert_eq!(identity.plan, "Pro Lite");
}

#[test]
fn an_api_key_login_names_no_account_rather_than_a_wrong_one() {
    let home = home(json!({ "auth_mode": "apikey", "OPENAI_API_KEY": "sk-live" }));
    let identity = identity_in(home.path());
    assert!(identity.email.is_empty());
    assert!(identity.plan.is_empty());
}

#[test]
fn a_missing_or_unreadable_file_is_not_a_panic() {
    let home = home(json!("not an object"));
    assert!(identity_in(home.path()).email.is_empty());
    assert!(identity_in(Path::new("/nonexistent/vibyra"))
        .email
        .is_empty());
}

#[test]
fn plan_slugs_read_as_the_plan_the_user_pays_for() {
    assert_eq!(chatgpt_plan("plus"), "Plus");
    assert_eq!(chatgpt_plan("pro"), "Pro");
    assert_eq!(chatgpt_plan("prolite"), "Pro Lite");
    assert_eq!(chatgpt_plan("self_serve_business_usage_based"), "Business");
    assert_eq!(chatgpt_plan("enterprise_cbp_automation"), "Enterprise");
    assert_eq!(chatgpt_plan("edu_pro"), "Education Pro");
    assert_eq!(chatgpt_plan("something_new"), "Something New");
    assert_eq!(chatgpt_plan(""), "");
}
