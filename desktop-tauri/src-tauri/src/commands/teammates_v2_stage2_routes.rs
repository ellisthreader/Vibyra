use super::uuid;

pub(super) fn route(path: &str, write: bool) -> Option<bool> {
    let parts: Vec<_> = path.split('/').collect();
    Some(match parts.as_slice() {
        ["agents", "v2", "runs", id, "instructions"] => write && uuid(id),
        ["agents", "v2", "teammates", id, "memories"] => uuid(id),
        ["agents", "v2", "teammates", id, "outputs"] => !write && uuid(id),
        ["agents", "v2", "actions", id, "draft"] => !write && uuid(id),
        ["agents", "v2", "outputs", id] => !write && uuid(id),
        ["agents", "v2", "outputs", id, "export"] => !write && uuid(id),
        _ => return None,
    })
}

pub(super) fn method(path: &str, verb: &str, body: bool) -> bool {
    if verb != "PATCH" || !body {
        return false;
    }
    let parts: Vec<_> = path.split('/').collect();
    match parts.as_slice() {
        ["agents", "v2", "teammates", agent, "memories", fact] => uuid(agent) && uuid(fact),
        ["agents", "v2", "actions", id, "draft"] | ["agents", "v2", "outputs", id] => uuid(id),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "550e8400-e29b-41d4-a716-446655440000";
    #[test]
    fn exact_stage_two_reads_writes_and_patch_only() {
        assert_eq!(
            route(&format!("agents/v2/runs/{ID}/instructions"), true),
            Some(true)
        );
        assert_eq!(
            route(&format!("agents/v2/runs/{ID}/instructions"), false),
            Some(false)
        );
        for suffix in [
            format!("teammates/{ID}/outputs"),
            format!("actions/{ID}/draft"),
            format!("outputs/{ID}"),
            format!("outputs/{ID}/export"),
        ] {
            assert_eq!(route(&format!("agents/v2/{suffix}"), false), Some(true));
            assert_eq!(route(&format!("agents/v2/{suffix}"), true), Some(false));
        }
        for path in [
            format!("agents/v2/teammates/{ID}/memories/{ID}"),
            format!("agents/v2/actions/{ID}/draft"),
            format!("agents/v2/outputs/{ID}"),
        ] {
            assert!(method(&path, "PATCH", true));
            assert!(!method(&path, "PATCH", false));
            assert!(!method(&path, "DELETE", true));
            assert!(!method(&(path + "?unsafe=1"), "PATCH", true));
        }
        assert_ne!(
            route(&format!("agents/v2/runner/{ID}/runs/{ID}/checkpoint"), true),
            Some(true)
        );
        assert_ne!(route("agents/v2/outputs/../export", false), Some(true));
    }
}
