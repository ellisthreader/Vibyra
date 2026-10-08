//! Agent v2 Phase 8 routes on the teammate bridge (docs/agent-v2-api-contract.md §6d): the task plan
//! preview, activity feed, roster + per-device read markers, and starter teammates. Exact shapes only.
use super::uuid;
use serde_json::{json, Value};

/// `[a-z][a-z0-9_]{1,max-1}`: a template key (`max` 40) and an activity provider filter (`max` 60)
/// each follow the backend's own pattern.
fn slug_up_to(value: &str, max: usize) -> bool {
    let bytes = value.as_bytes();
    (2..=max).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_')
}
fn slug(value: &str) -> bool {
    slug_up_to(value, 40)
}

/// GET (`write == false`) and POST (`write == true`) overview routes. `None` = not an overview route.
pub(super) fn overview_route(parts: &[&str], write: bool) -> Option<bool> {
    Some(match parts {
        ["agents", "v2", "roster" | "templates"] => !write,
        ["agents", "v2", "runs", "preview"] => write,
        ["agents", "v2", "agents", id, "read"] => write && uuid(id),
        ["agents", "v2", "templates", key, "teammates"] => write && slug(key),
        _ => return None,
    })
}

/// `limit=N[&provider=p][&agentId=uuid][&cursor=c]`, in that fixed order (the order the clients
/// build it in): `limit` is required, nothing repeats and nothing else is accepted.
pub(super) fn activity_query(query: &str) -> bool {
    type QueryCheck = (&'static str, fn(&str) -> bool);
    let checks: [QueryCheck; 4] = [
        ("limit=", |v| {
            (1..=3).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_digit())
        }),
        ("provider=", |v| slug_up_to(v, 60)),
        ("agentId=", uuid),
        ("cursor=", |v| {
            (1..=200).contains(&v.len())
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        }),
    ];
    let mut next = 0;
    for (i, pair) in query.split('&').enumerate() {
        let Some(at) = (next..checks.len()).find(|&n| pair.starts_with(checks[n].0)) else {
            return false;
        };
        if (i == 0 && at != 0) || !(checks[at].1)(&pair[checks[at].0.len()..]) {
            return false;
        }
        next = at + 1;
    }
    next > 0
}

/// `X-Vibyra-Device`: `[A-Za-z0-9._:-]{1,64}`, stable for an install.
pub(super) fn valid_device(value: &str) -> bool {
    (1..=64).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

/// Only the roster list and the read marker are per device; every other route refuses a device.
pub(super) fn takes_device(path: &str, write: bool) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    matches!(
        (write, parts.as_slice()),
        (false, ["agents", "v2", "roster"]) | (true, ["agents", "v2", "agents", _, "read"])
    )
}

fn clip(value: &Value, max: usize) -> Option<String> {
    let text = value.as_str()?.trim();
    (!text.is_empty()).then(|| text.chars().take(max).collect())
}

/// The refusal's machine `code` and `fix` for an `agents/v2/` call, appended after the ordinary
/// `"{status}: {detail}"` behind U+001E so the renderer can branch on them without the words changing.
pub(super) fn error_suffix(path: &str, body: &Value) -> String {
    if !path.starts_with("agents/v2/") {
        return String::new();
    }
    let word = |v: &Value, max: usize| {
        clip(v, max).filter(|s| {
            s.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        })
    };
    let code = word(&body["code"], 60);
    let fix = match (
        word(&body["fix"]["action"], 40),
        clip(&body["fix"]["message"], 300),
    ) {
        (Some(action), Some(message)) => Some(json!({ "action": action, "message": message })),
        _ => None,
    };
    if code.is_none() && fix.is_none() {
        return String::new();
    }
    format!("\u{1e}{}", json!({ "code": code, "fix": fix }))
}

#[cfg(test)]
#[path = "teammates_v2_overview_routes_test.rs"]
mod tests;
