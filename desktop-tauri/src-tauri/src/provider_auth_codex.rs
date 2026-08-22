use crate::provider_auth_codex_account::identity_in;
use crate::provider_auth_home::AccountHome;
use crate::provider_auth_identity::{product_detail, safe_label};
use crate::provider_auth_process::command_streams;
use crate::provider_auth_state::AuthSnapshot;

pub fn probe(program: &str, home: &AccountHome) -> AuthSnapshot {
    let Some((success, stdout, stderr)) =
        command_streams(program, &["login", "status"], home.env())
    else {
        return AuthSnapshot::failed();
    };
    if !success || !chatgpt_login(&format!("{stdout}\n{stderr}")) {
        return AuthSnapshot::default();
    }
    // The CLI confirms the sign-in; only its stored credentials say whose it
    // is, so the row names the account rather than repeating "ChatGPT" twice.
    let account = identity_in(&home.credentials_dir());
    AuthSnapshot {
        connected: true,
        account_label: safe_label(&account.email, "ChatGPT account"),
        detail: product_detail("ChatGPT", &account.plan),
        ..AuthSnapshot::default()
    }
}

/// `codex login status` writes its report to stderr, and it reports API key,
/// access token and Bedrock sign-ins with the same "Logged in using" prefix as
/// a ChatGPT sign-in. This row connects a ChatGPT account, so match that alone.
fn chatgpt_login(report: &str) -> bool {
    report.to_lowercase().contains("logged in using chatgpt")
}

#[cfg(test)]
mod tests {
    use super::chatgpt_login;

    #[test]
    fn recognizes_the_chatgpt_sign_in_report() {
        assert!(chatgpt_login("Logged in using ChatGPT\n"));
    }

    #[test]
    fn ignores_reports_that_are_not_a_chatgpt_account() {
        for report in [
            "Not logged in",
            "Logged in using an API key - sk-live",
            "Logged in using access token",
            "Logged in using Amazon Bedrock API key",
            "Logged in using personal access token",
            "",
        ] {
            assert!(!chatgpt_login(report), "{report}");
        }
    }
}
