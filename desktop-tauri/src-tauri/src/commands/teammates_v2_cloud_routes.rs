/// Only the user-facing Cloud Agent policy and quote. Runtime bearer routes remain private.
pub(super) fn route(path: &str, write: bool) -> Option<bool> {
    if let Some((base, query)) = path.split_once('?') {
        let parts: Vec<_> = base.split('/').collect();
        if let ["agents", "v2", "teammates", agent, "memories"] = parts.as_slice() {
            return Some(
                !write
                    && super::uuid(agent)
                    && query.strip_prefix("runtimeId=").is_some_and(super::uuid),
            );
        }
    }
    match path {
        "agents/v2/cloud" => Some(!write),
        "agents/v2/cloud/quote" => Some(write),
        _ => None,
    }
}
pub(super) fn method(path: &str, verb: &str, body: bool) -> bool {
    path == "agents/v2/cloud" && body && matches!(verb, "PUT" | "DELETE")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_policy_and_review_routes() {
        assert_eq!(route("agents/v2/cloud", false), Some(true));
        assert_eq!(route("agents/v2/cloud", true), Some(false));
        assert_eq!(route("agents/v2/cloud/quote", true), Some(true));
        assert_eq!(route("agents/v2/cloud/quote", false), Some(false));
        let id = "550e8400-e29b-41d4-a716-446655440000";
        let memory = format!("agents/v2/teammates/{id}/memories?runtimeId={id}");
        assert_eq!(route(&memory, false), Some(true));
        assert_eq!(route(&memory, true), Some(false));
        assert_eq!(route(&(memory + "&unsafe=1"), false), Some(false));
        for verb in ["PUT", "DELETE"] {
            assert!(method("agents/v2/cloud", verb, true));
            assert!(!method("agents/v2/cloud", verb, false));
        }
        for verb in ["POST", "PATCH", "GET"] {
            assert!(!method("agents/v2/cloud", verb, true));
        }
        for path in [
            "agents/v2/cloud?x=1",
            "agents/v2/cloud/",
            "agents/v2/cloud/quote?x=1",
            "cloud-runtime/workspace/agents/next",
        ] {
            assert_ne!(route(path, true), Some(true));
            assert!(!method(path, "PUT", true));
        }
    }
}
