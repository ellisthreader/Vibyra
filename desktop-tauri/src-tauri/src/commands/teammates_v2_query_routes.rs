//! Agent v2 reads that carry a query string on the teammate bridge (docs/agent-v2-api-contract.md §5, §6b, §6d).
//! Run/routine/trigger lists by teammate, event replay by cursor, history pages and the activity feed, each with an
//! exact, bounded shape. Nothing else under `agents/v2/` accepts a query.
use super::uuid;

/// `Some(allowed)` when `path` is an `agents/v2/` path with a query; `None` when it has none to judge.
pub(super) fn v2_query(path: &str, write: bool) -> Option<bool> {
    if let Some((base, query)) = path
        .split_once('?')
        .filter(|(b, _)| b.starts_with("agents/v2/"))
    {
        let (first, second) = query
            .split_once('&')
            .map_or((Some(query), None), |(a, b)| (Some(a), Some(b)));
        let num = |q: Option<&str>, key: &str, max: usize| {
            q.and_then(|v| v.strip_prefix(key)).is_some_and(|v| {
                !v.is_empty() && v.len() <= max && v.bytes().all(|b| b.is_ascii_digit())
            })
        };
        let runs = base == "agents/v2/runs"
            && first
                .and_then(|a| a.strip_prefix("agentId="))
                .is_some_and(uuid)
            && num(second, "limit=", 2);
        let events = base
            .strip_prefix("agents/v2/runs/")
            .and_then(|r| r.strip_suffix("/events"))
            .is_some_and(uuid)
            && num(first, "after=", 10)
            && num(second, "limit=", 3);
        let by_agent = matches!(base, "agents/v2/schedules" | "agents/v2/triggers")
            && first
                .and_then(|a| a.strip_prefix("agentId="))
                .is_some_and(uuid)
            && second.is_none();
        let history = [
            ("agents/v2/schedules/", "/occurrences"),
            ("agents/v2/triggers/", "/events"),
        ]
        .iter()
        .any(|(prefix, suffix)| {
            base.strip_prefix(prefix)
                .and_then(|r| r.strip_suffix(suffix))
                .is_some_and(uuid)
        }) && num(first, "limit=", 3)
            && second.is_none();
        let activity = base == "agents/v2/activity" && super::overview::activity_query(query);
        return Some(!write && (runs || events || by_agent || history || activity));
    }
    None
}
