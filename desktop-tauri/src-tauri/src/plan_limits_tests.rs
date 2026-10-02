use super::*;
use serde_json::json;

fn free() -> Value {
    json!({"planLimits":{"version":1,"enforced":true,"plan":"free","trial":false,"paidUntil":null,
        "maxTerminals":2,"maxProjects":1,"safeWorktrees":false,"preview":false,"review":false,
        "agents":false,"remoteAccess":false}})
}

fn project(id: &str, root: &str) -> ProjectSpec {
    ProjectSpec {
        id: id.into(),
        root: root.into(),
        ..ProjectSpec::default()
    }
}

#[test]
fn projects_lock_by_position_and_a_save_cannot_add_past_the_limit() {
    let limits = PlanLimits::from_user(&free());
    let saved = vec![project("a", "/work/orbit"), project("b", "/work/bakery")];
    assert_eq!(project_position(&saved, "/work/orbit/src"), Some(0));
    assert_eq!(project_position(&saved, "/work/bakery"), Some(1));
    assert_eq!(project_position(&saved, "/elsewhere"), None);
    let nested = vec![project("a", "/work"), project("b", "/work/inner")];
    assert_eq!(project_position(&nested, "/work/inner/x"), Some(1));
    // Keeping or removing what is there is fine; adding a second is not.
    assert!(limits.admit_project_list(&saved, &saved).is_ok());
    assert!(limits.admit_project_list(&saved, &saved[..1]).is_ok());
    let one = vec![project("a", "/work/orbit")];
    let added = vec![project("a", "/work/orbit"), project("c", "/work/new")];
    assert!(limits.admit_project_list(&one, &added).is_err());
    assert!(PlanLimits::default()
        .admit_project_list(&one, &added)
        .is_ok());
}

#[test]
fn free_uses_one_project_and_holds_back_preview_and_review() {
    let limits = PlanLimits::from_user(&free());
    assert!(limits.admit_project(0).is_ok());
    assert!(limits
        .admit_project(1)
        .unwrap_err()
        .starts_with("plan-limit:projects: Free includes 1 project."));
    assert!(limits
        .admit_preview()
        .unwrap_err()
        .starts_with("plan-limit:preview:"));
    assert!(limits
        .admit_review()
        .unwrap_err()
        .starts_with("plan-limit:review:"));
    let open = PlanLimits::default();
    assert!(
        open.admit_project(40).is_ok()
            && open.admit_preview().is_ok()
            && open.admit_review().is_ok()
    );
}

#[test]
fn free_admits_two_running_terminals_then_asks_for_pro() {
    let limits = PlanLimits::from_user(&free());
    assert_eq!(limits.max_terminals, Some(2));
    assert!(limits.admit_terminal(0).is_ok());
    assert!(limits.admit_terminal(1).is_ok());
    let error = limits.admit_terminal(2).unwrap_err();
    assert!(error.starts_with("plan-limit:terminals: Free runs 2 terminals at once."));
    assert!(limits
        .admit_safe_worktrees()
        .unwrap_err()
        .starts_with("plan-limit:worktrees:"));
}

#[test]
fn pro_and_trial_are_unlimited() {
    let user = json!({"planLimits":{"version":1,"enforced":true,"plan":"pro_v2","trial":true,
        "paidUntil":"2026-10-12T00:00:00+00:00","maxTerminals":null,"maxProjects":null,"safeWorktrees":true,
        "preview":true,"review":true,"agents":true,"remoteAccess":true}});
    let limits = PlanLimits::from_user(&user);
    assert!(limits.trial);
    assert_eq!(
        limits.paid_until.as_deref(),
        Some("2026-10-12T00:00:00+00:00")
    );
    assert!(limits.admit_terminal(50).is_ok());
    assert!(limits.admit_project(50).is_ok());
    assert!(limits.admit_safe_worktrees().is_ok());
}

#[test]
fn limits_stay_open_until_the_server_switches_them_on_or_sends_none() {
    let off = json!({"planLimits":{"version":1,"enforced":false,"plan":"free","maxTerminals":2,
        "safeWorktrees":false,"agents":false,"remoteAccess":false}});
    for user in [off, json!({}), json!({"planLimits":{"version":2}})] {
        let limits = PlanLimits::from_user(&user);
        assert!(limits.admit_terminal(99).is_ok());
        assert!(limits.admit_safe_worktrees().is_ok());
    }
}

#[test]
fn a_missing_or_malformed_limit_under_enforcement_falls_to_free() {
    let user =
        json!({"planLimits":{"version":1,"enforced":true,"plan":"free","maxTerminals":"lots"}});
    let limits = PlanLimits::from_user(&user);
    assert_eq!(limits.max_terminals, Some(2));
    assert!(!limits.safe_worktrees && !limits.agents && !limits.remote_access);
    assert!(PlanLimits::signed_out().admit_terminal(2).is_err());
    let silent = json!({"planLimits":{"version":1,"enforced":true,"plan":"free"}});
    assert_eq!(PlanLimits::from_user(&silent).max_terminals, Some(2));
}
