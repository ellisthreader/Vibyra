/// Account-owned jobs and reviewed coordination; no runner or arbitrary query access.
pub(super) fn route(path: &str, write: bool) -> Option<bool> {
    let (base, query) = path
        .split_once('?')
        .map_or((path, None), |(p, q)| (p, Some(q)));
    let parts: Vec<_> = base.split('/').collect();
    match parts.as_slice() {
        ["agents", "v2", "jobs"] => {
            Some(!write && (list_query(query, "agentId") || key_query(query)))
        }
        ["agents", "v2", "groups"] => {
            Some(!write && (query.is_none() || query == Some("includeArchived=true")))
        }
        ["agents", "v2", "groups" | "workflows", id] => {
            Some(!write && super::uuid(id) && query.is_none())
        }
        ["agents", "v2", "groups", id, "messages"] => Some(
            super::uuid(id)
                && if write {
                    query.is_none()
                } else {
                    query.is_none_or(|q| q.strip_prefix("key=").is_some_and(super::uuid))
                },
        ),
        ["agents", "v2", "groups", id, "workflows"] => {
            Some(!write && super::uuid(id) && list_query(query, "cursor"))
        }
        ["agents", "v2", "workflows", id, "control" | "confirm"] => {
            Some(write && super::uuid(id) && query.is_none())
        }
        _ => None,
    }
}
pub(super) fn method(path: &str, method: &str, body: bool) -> bool {
    if !body || path.contains('?') {
        return false;
    }
    matches!(path.split('/').collect::<Vec<_>>().as_slice(), ["agents","v2","groups",id] if super::uuid(id) && matches!(method,"PUT"|"DELETE"))
}
fn key_query(query: Option<&str>) -> bool {
    let Some(q) = query else {
        return false;
    };
    let p: Vec<_> = q.split('&').collect();
    matches!(p.as_slice(),[agent,key] if agent.strip_prefix("agentId=").is_some_and(super::uuid) && key.strip_prefix("idempotencyKey=").is_some_and(super::uuid))
}
fn list_query(query: Option<&str>, key: &str) -> bool {
    let Some(query) = query else {
        return true;
    };
    let parts: Vec<_> = query.split('&').collect();
    let limit = |p: &str| {
        p.strip_prefix("limit=")
            .and_then(|v| v.parse::<u8>().ok())
            .is_some_and(|n| (1..=50).contains(&n))
    };
    match parts.as_slice() {
        [one] => {
            limit(one)
                || one
                    .strip_prefix(&format!("{key}="))
                    .is_some_and(super::uuid)
        }
        [first, last] => {
            first
                .strip_prefix(&format!("{key}="))
                .is_some_and(super::uuid)
                && limit(last)
        }
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "550e8400-e29b-41d4-a716-446655440000";
    #[test]
    fn only_exact_account_reads_and_bound_queries() {
        for p in [
            "agents/v2/jobs?limit=50".into(),
            format!("agents/v2/jobs?agentId={ID}&limit=50"),
            "agents/v2/groups".into(),
            format!("agents/v2/groups/{ID}/messages?key={ID}"),
            format!("agents/v2/groups/{ID}/workflows?cursor={ID}&limit=20"),
        ] {
            assert_eq!(route(&p, false), Some(true));
            assert_ne!(route(&p, true), Some(true));
            assert_ne!(route(&(p + "&extra=1"), false), Some(true));
        }
        for p in [
            "agents/v2/jobs?limit=0",
            "agents/v2/jobs?limit=51",
            "agents/v2/jobs?limit=20&limit=20",
            "agents/v2/jobs?agentId=../x",
            "agents/v2/groups?userId=2",
        ] {
            assert_ne!(route(p, false), Some(true));
        }
    }
    #[test]
    fn group_writes_never_open_runner_routes() {
        let p = format!("agents/v2/groups/{ID}");
        for verb in ["PUT", "DELETE"] {
            assert!(method(&p, verb, true));
            assert!(!method(&p, verb, false));
            assert!(!method(&(p.clone() + "?x=1"), verb, true));
        }
        assert!(!method(&p, "PATCH", true));
        for p in [
            format!("agents/v2/groups/{ID}/messages"),
            format!("agents/v2/workflows/{ID}/control"),
            format!("agents/v2/workflows/{ID}/confirm"),
        ] {
            assert_eq!(route(&p, true), Some(true));
            assert_ne!(route(&(p + "?limit=1"), true), Some(true));
        }
        assert_ne!(route("agents/v2/runner/groups", true), Some(true));
    }
}
