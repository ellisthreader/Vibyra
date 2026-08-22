use crate::provider_auth_attempt::{AttemptState, AttemptView};
use crate::provider_auth_home::DEFAULT_ACCOUNT;
use crate::provider_auth_state::{AuthSnapshot, ProviderAccountView, ProviderDefinition};

/// What one account row says, given what the machine actually has.
///
/// Order matters. A CLI being installed right now is reported as installing
/// rather than missing, and an install that failed keeps saying so instead of
/// falling back to "not installed" — otherwise the reason npm gave, which is
/// the only thing that tells the user what to do next, is thrown away.
pub fn build(
    provider: ProviderDefinition,
    account_id: &str,
    available: bool,
    auth: AuthSnapshot,
    attempt: AttemptView,
) -> ProviderAccountView {
    let running = attempt.state == AttemptState::Running;
    let failed = attempt.state == AttemptState::Failed;
    let status = if auth.connected {
        "connected"
    } else if running && attempt.installing {
        "installing"
    } else if running {
        "connecting"
    } else if failed {
        "error"
    } else if !available {
        "not-installed"
    } else if auth.probe_failed {
        "error"
    } else {
        "sign-in-required"
    };
    let detail = detail(status, provider, &auth, &attempt);
    ProviderAccountView {
        account_id: account_id.to_string(),
        status: status.into(),
        account_label: auth.account_label,
        detail,
        sign_in_page_available: attempt.sign_in_page_available,
        // Only a sign-in ever has a question worth answering. npm prints
        // plenty of lines that end like one and none of them are.
        prompt: if attempt.installing {
            String::new()
        } else {
            attempt.prompt
        },
        // The first account is the CLI's own folder. Signing out of it is the
        // user's business; deleting it is not Vibyra's.
        removable: account_id != DEFAULT_ACCOUNT,
    }
}

fn detail(
    status: &str,
    provider: ProviderDefinition,
    auth: &AuthSnapshot,
    attempt: &AttemptView,
) -> String {
    match status {
        "connected" => auth.detail.clone(),
        "installing" => format!("Installing the {} command line app…", provider.product),
        "connecting" => format!(
            "Finish the sign-in {} opened in your browser.",
            provider.product
        ),
        "error" if attempt.installing => {
            because(&format!("Could not install {}.", provider.product), attempt)
        }
        "error" if attempt.state == AttemptState::Failed => because(
            "Authorization ended before the account connected. Try again.",
            attempt,
        ),
        "error" => "Could not verify this account. Check the provider app and try again.".into(),
        "not-installed" => format!(
            "Connecting a {} account needs its command line app. Vibyra can install it.",
            provider.product
        ),
        _ => format!("Connect your existing {} account.", provider.product),
    }
}

/// Quotes what the CLI actually said. A failure the user can read is a failure
/// they can act on; "try again" on its own is not.
fn because(headline: &str, attempt: &AttemptView) -> String {
    if attempt.failure_line.is_empty() {
        headline.into()
    } else {
        format!("{headline} {}", attempt.failure_line)
    }
}

#[cfg(test)]
#[path = "provider_auth_view_tests.rs"]
mod tests;
