use super::*;

#[test]
fn account_replacement_logout_reauthentication_and_host_restart_invalidate_results() {
    let old = Context {
        scope: Scope {
            account_scope: "owner-a".into(),
            host_id: "host-a".into(),
        },
        token: "session-a".into(),
        proof: None,
    };
    assert!(old.ensure_current(&old.scope, "session-a").is_ok());
    for scope in [
        Scope {
            account_scope: "owner-b".into(),
            host_id: "host-a".into(),
        },
        Scope {
            account_scope: "owner-a".into(),
            host_id: "host-b".into(),
        },
        Scope {
            account_scope: "owner-a".into(),
            host_id: String::new(),
        },
    ] {
        assert!(old.ensure_current(&scope, "session-a").is_err());
    }
    assert!(old.ensure_current(&old.scope, "session-b").is_err());
    assert!(old.ensure_current(&old.scope, "").is_err());
}

#[test]
fn global_security_without_host_still_requires_the_same_account_session() {
    let captured = Context {
        scope: Scope {
            account_scope: "owner".into(),
            host_id: String::new(),
        },
        token: "session".into(),
        proof: None,
    };
    assert!(captured.ensure_current(&captured.scope, "session").is_ok());
    assert!(captured
        .ensure_current(&captured.scope, "replaced-session")
        .is_err());
    let other = Scope {
        account_scope: "another-owner".into(),
        host_id: String::new(),
    };
    assert!(captured.ensure_current(&other, "session").is_err());
}

#[test]
fn emergency_disable_survives_local_shutdown_but_never_crosses_account_or_token() {
    let captured = Context {
        scope: Scope {
            account_scope: "owner".into(),
            host_id: "host".into(),
        },
        token: "session".into(),
        proof: None,
    };
    let stopped = Scope {
        account_scope: "owner".into(),
        host_id: String::new(),
    };
    assert!(captured.ensure_account(&stopped, "session").is_ok());
    assert!(captured.ensure_current(&stopped, "session").is_err());
    assert!(captured
        .ensure_account(&stopped, "different-session")
        .is_err());
    let replaced = Scope {
        account_scope: "other-owner".into(),
        host_id: String::new(),
    };
    assert!(captured.ensure_account(&replaced, "session").is_err());
}
