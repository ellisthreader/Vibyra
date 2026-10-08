/// Account-facing work review only. Runner, admission and source signal routes stay private.
pub(super) fn route(path: &str, write: bool) -> Option<bool> {
    let (base, query) = path
        .split_once('?')
        .map_or((path, None), |(p, q)| (p, Some(q)));
    let parts: Vec<_> = base.split('/').collect();
    match parts.as_slice() {
        ["notifications", "v1", "inbox", id, "read"] => {
            Some(write && query.is_none() && super::uuid(id))
        }
        ["agents", "v2", "goals" | "followups" | "signals"] => Some(!write && agent_query(query)),
        ["agents", "v2", "followups", "sources"] => Some(!write && agent_query(query)),
        ["agents", "v2", "proposals"] => Some(!write && proposal_query(query)),
        ["agents", "v2", "goals" | "followups" | "proposals", id] => {
            Some(!write && query.is_none() && super::uuid(id))
        }
        ["agents", "v2", "goals" | "followups", id, "control"]
        | ["agents", "v2", "goals", id, "confirm"]
        | ["agents", "v2", "proposals", id, "accept" | "discard"]
        | ["agents", "v2", "signals", "findings", id, "dismiss"] => {
            Some(write && query.is_none() && super::uuid(id))
        }
        ["agents", "v2", "signals", "digests", id] => {
            Some(!write && query.is_none() && super::uuid(id))
        }
        _ => None,
    }
}
pub(super) fn method(path: &str, method: &str, body: bool) -> bool {
    if !body || path.contains('?') {
        return false;
    }
    let parts: Vec<_> = path.split('/').collect();
    match (method, parts.as_slice()) {
        ("PATCH", ["agents", "v2", "proposals", id]) => super::uuid(id),
        ("PUT", ["agents", "v2", "signals", "preferences" | "onboarding"]) => true,
        ("PUT", ["agents", "v2", "signals", "watches", id]) => super::uuid(id),
        _ => false,
    }
}
fn agent_query(query: Option<&str>) -> bool {
    query.is_none_or(|q| q.strip_prefix("agentId=").is_some_and(super::uuid))
}
fn proposal_query(query: Option<&str>) -> bool {
    let Some(query) = query else {
        return true;
    };
    let parts: Vec<_> = query.split('&').collect();
    match parts.as_slice() {
        [one] => one
            .strip_prefix("agentId=")
            .or_else(|| one.strip_prefix("runId="))
            .is_some_and(super::uuid),
        [agent, run] => {
            agent.strip_prefix("agentId=").is_some_and(super::uuid)
                && run.strip_prefix("runId=").is_some_and(super::uuid)
        }
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "550e8400-e29b-41d4-a716-446655440000";
    #[test]
    fn review_queries_are_exact_and_never_writes() {
        for base in [
            "goals",
            "followups",
            "followups/sources",
            "signals",
            "proposals",
        ] {
            let path = format!("agents/v2/{base}?agentId={ID}");
            assert_eq!(route(&path, false), Some(true));
            assert_eq!(route(&path, true), Some(false));
            assert_ne!(route(&(path + "&extra=1"), false), Some(true));
        }
        assert_eq!(
            route(
                &format!("agents/v2/proposals?agentId={ID}&runId={ID}"),
                false
            ),
            Some(true)
        );
        assert_ne!(
            route(
                &format!("agents/v2/proposals?agentId={ID}&agentId={ID}"),
                false
            ),
            Some(true)
        );
    }
    #[test]
    fn exact_mutation_methods_and_body_requirements() {
        for (path, verb) in [
            (format!("agents/v2/proposals/{ID}"), "PATCH"),
            ("agents/v2/signals/preferences".into(), "PUT"),
            ("agents/v2/signals/onboarding".into(), "PUT"),
            (format!("agents/v2/signals/watches/{ID}"), "PUT"),
        ] {
            assert!(method(&path, verb, true));
            assert!(!method(&path, verb, false));
            assert!(!method(&path, "DELETE", true));
            assert!(!method(&(path + "?x=1"), verb, true));
        }
        for path in [
            format!("agents/v2/proposals/{ID}/accept"),
            format!("agents/v2/goals/{ID}/confirm"),
            format!("agents/v2/followups/{ID}/control"),
        ] {
            assert_eq!(route(&path, true), Some(true));
            assert_eq!(route(&path, false), Some(false));
        }
        assert_ne!(route("agents/v2/proposals/../../accept", true), Some(true));
        assert_ne!(route("agents/v2/runner/work", true), Some(true));
    }
}
