use super::build;
use crate::provider_auth_attempt::{AttemptState, AttemptView};
use crate::provider_auth_home::DEFAULT_ACCOUNT;
use crate::provider_auth_state::{
    definition, AuthSnapshot, ProviderAccountView, ProviderDefinition,
};

fn claude() -> ProviderDefinition {
    definition("claude").unwrap()
}

/// Every row in these tests is the provider's first account; the ones that
/// care about a second name it themselves.
fn row(available: bool, auth: AuthSnapshot, attempt: AttemptView) -> ProviderAccountView {
    build(claude(), DEFAULT_ACCOUNT, available, auth, attempt)
}

fn attempt(state: AttemptState, installing: bool) -> AttemptView {
    AttemptView {
        state,
        installing,
        ..AttemptView::default()
    }
}

#[test]
fn a_missing_cli_offers_an_install_rather_than_an_instruction() {
    let row = row(false, AuthSnapshot::default(), AttemptView::default());
    assert_eq!(row.status, "not-installed");
    assert!(row.detail.contains("Vibyra can install it"));
}

#[test]
fn an_install_in_flight_is_not_reported_as_missing() {
    let row = row(
        false,
        AuthSnapshot::default(),
        attempt(AttemptState::Running, true),
    );
    assert_eq!(row.status, "installing");
}

/// The reason npm gave is the only thing that tells the user what to do next,
/// so a failed install must not decay back into a bare "not installed".
#[test]
fn a_failed_install_keeps_the_reason_it_failed() {
    let row = row(
        false,
        AuthSnapshot::default(),
        AttemptView {
            state: AttemptState::Failed,
            installing: true,
            failure_line: "npm error EACCES permission denied".into(),
            ..AttemptView::default()
        },
    );
    assert_eq!(row.status, "error");
    assert!(row.detail.contains("npm error EACCES permission denied"));
}

#[test]
fn a_question_from_the_cli_reaches_the_row() {
    let row = row(
        true,
        AuthSnapshot::default(),
        AttemptView {
            state: AttemptState::Running,
            prompt: "Paste code here if prompted >".into(),
            sign_in_page_available: true,
            ..AttemptView::default()
        },
    );
    assert_eq!(row.status, "connecting");
    assert_eq!(row.prompt, "Paste code here if prompted >");
}

#[test]
fn a_connected_account_outranks_every_other_signal() {
    let auth = AuthSnapshot {
        connected: true,
        account_label: "person@example.test".into(),
        detail: "Claude Max".into(),
        ..AuthSnapshot::default()
    };
    let row = row(true, auth, attempt(AttemptState::Failed, false));
    assert_eq!(row.status, "connected");
    assert_eq!(row.detail, "Claude Max");
}

/// The first account is the CLI's own folder, so the row must not offer to
/// delete it — only added accounts own a folder Vibyra may remove.
#[test]
fn only_an_added_account_offers_to_be_removed() {
    let first = row(true, AuthSnapshot::default(), AttemptView::default());
    assert!(!first.removable);
    assert_eq!(first.account_id, DEFAULT_ACCOUNT);

    let second = build(
        claude(),
        "a1b2c3",
        true,
        AuthSnapshot::default(),
        AttemptView::default(),
    );
    assert!(second.removable);
    assert_eq!(second.account_id, "a1b2c3");
}
