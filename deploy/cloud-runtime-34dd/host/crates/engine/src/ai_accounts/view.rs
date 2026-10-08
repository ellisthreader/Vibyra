//! What one account row says, given what the computer really has. Same shape
//! (`ProviderAccountView`) and statuses as the Mac app's, so the phone's
//! Accounts page needs no second code path.
use super::{
    attempt::{AttemptView, Phase},
    probe::Auth,
    Provider,
};
use serde_json::{json, Value};

pub(super) const DEFAULT_ACCOUNT: &str = "default";

pub(super) fn account(
    provider: &Provider,
    installed: bool,
    auth: &Auth,
    attempt: &AttemptView,
    login_secs: u64,
) -> Value {
    let running = attempt.phase == Phase::Running;
    // A sign-in running over an existing login (Cloud replacing a copy of the
    // Mac's) still shows its page and code: the attempt wins while it runs.
    let status = if running {
        "connecting"
    } else if auth.connected {
        "connected"
    } else {
        match attempt.phase {
            Phase::Running | Phase::Exited => "connecting",
            Phase::Failed | Phase::TimedOut => "error",
            _ if !installed => "not-installed",
            _ if auth.probe_failed => "error",
            _ => "sign-in-required",
        }
    };
    let detail = match status {
        "connected" => auth.detail.clone(),
        "connecting" if attempt.phase == Phase::Exited => "Finishing the sign-in…".into(),
        "connecting" if provider.id == "codex" => {
            "Open the sign-in page on this phone and enter the code.".into()
        }
        "connecting" => "Open the sign-in page, then paste the code Claude gives you.".into(),
        "error" if attempt.phase == Phase::TimedOut => {
            format!(
                "The sign-in was not finished within {}. Try again.",
                span(login_secs)
            )
        }
        "error" if attempt.phase == Phase::Failed => {
            let said = &attempt.failure_line;
            let headline = "The sign-in ended before the account connected. Try again.";
            if said.is_empty() {
                headline.into()
            } else {
                format!("{headline} {said}")
            }
        }
        "error" => "Could not check this account. Try again.".into(),
        "not-installed" => format!("{} is not installed on this computer.", provider.product),
        _ if attempt.phase == Phase::Cancelled => "The sign-in was cancelled.".into(),
        _ => format!("Connect your {} account.", provider.product),
    };
    json!({
        "accountId": DEFAULT_ACCOUNT,
        "status": status,
        "accountLabel": if auth.connected { auth.label.as_str() } else { "" },
        "detail": detail,
        "signInPageAvailable": running && attempt.sign_in_page_available,
        "deviceCode": if running { attempt.device_code.as_str() } else { "" },
        "prompt": if running { attempt.prompt.as_str() } else { "" },
        // The account at $HOME is the CLI's own: sign out, never delete.
        "removable": false,
    })
}

fn span(secs: u64) -> String {
    let (n, unit) = if secs >= 60 {
        (secs.div_ceil(60), "minute")
    } else {
        (secs.max(1), "second")
    };
    format!("{n} {unit}{}", if n == 1 { "" } else { "s" })
}
