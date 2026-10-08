//! Agent v2 connections hub, grants and remote MCP routes on the teammate bridge
//! (docs/agent-v2-api-contract.md §5 "Connections and grants", §6c). Exact shapes only:
//! no queries, UUID ids, and a provider slug limited to the backend's own pattern.
use super::uuid;

/// `[a-z][a-z0-9_]{1,39}`, the backend's `connections/{provider}/start` constraint.
fn provider(value: &str) -> bool {
    let bytes = value.as_bytes();
    (2..=40).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_')
}

/// GET (`write == false`) and POST (`write == true`) hub routes. `None` = not a hub route.
pub(super) fn hub_route(parts: &[&str], write: bool) -> Option<bool> {
    Some(match parts {
        ["agents", "v2", "catalogue"] => !write,
        ["agents", "v2", "local-mcp"] => !write,
        // GET is the hub list (already allowed with capabilities); POST is a pasted token.
        ["agents", "v2", "connections"] => write,
        ["agents", "v2", "connections", "flows", id] => !write && uuid(id),
        ["agents", "v2", "connections", slug, "start"] => write && provider(slug),
        ["agents", "v2", "agents", id, "grants"] => !write && uuid(id),
        // Phase 7: a teammate's allowed browser sites (PUT/DELETE below).
        ["agents", "v2", "agents", id, "browser"] => !write && uuid(id),
        ["agents", "v2", "mcp", "servers"] => write,
        ["agents", "v2", "mcp", "servers", id] => !write && uuid(id),
        ["agents", "v2", "mcp", "servers", id, "signin" | "refresh" | "approve"] => {
            write && uuid(id)
        }
        _ => return None,
    })
}

/// PUT always carries a body; DELETE never does.
pub(super) fn hub_method(parts: &[&str], method: &str, has_body: bool) -> bool {
    match (method, parts) {
        ("DELETE", ["agents", "v2", "connections", id]) => !has_body && uuid(id),
        ("DELETE", ["agents", "v2", "agents", agent, "grants", connection]) => {
            !has_body && uuid(agent) && uuid(connection)
        }
        ("PUT", ["agents", "v2", "agents", agent, "grants", connection]) => {
            has_body && uuid(agent) && uuid(connection)
        }
        ("PUT", ["agents", "v2", "mcp", "servers", id, "reads"]) => has_body && uuid(id),
        ("PUT", ["agents", "v2", "agents", id, "browser"]) => has_body && uuid(id),
        ("DELETE", ["agents", "v2", "agents", id, "browser"]) => !has_body && uuid(id),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::super::{permitted, permitted_method};

    #[test]
    fn hub_grant_and_mcp_routes_are_exact() {
        let id = "123e4567-e89b-12d3-a456-426614174000";
        let reads = [
            "agents/v2/connections".to_string(),
            "agents/v2/catalogue".to_string(),
            "agents/v2/local-mcp".to_string(),
            format!("agents/v2/connections/flows/{id}"),
            format!("agents/v2/agents/{id}/grants"),
            format!("agents/v2/agents/{id}/browser"),
            format!("agents/v2/mcp/servers/{id}"),
        ];
        let writes = [
            "agents/v2/connections".to_string(),
            "agents/v2/connections/gmail/start".to_string(),
            "agents/v2/connections/google_calendar/start".to_string(),
            "agents/v2/mcp/servers".to_string(),
            format!("agents/v2/mcp/servers/{id}/signin"),
            format!("agents/v2/mcp/servers/{id}/refresh"),
            format!("agents/v2/mcp/servers/{id}/approve"),
        ];
        assert!(reads.iter().all(|p| permitted(p, false)));
        assert!(writes.iter().all(|p| permitted(p, true)));
        for p in &reads[1..] {
            assert!(!permitted(p, true), "{p}");
        }
        for p in &writes[1..] {
            assert!(!permitted(p, false), "{p}");
        }
        let grant = format!("agents/v2/agents/{id}/grants/{id}");
        assert!(permitted_method(&grant, "PUT", true));
        assert!(permitted_method(&grant, "DELETE", false));
        assert!(permitted_method(
            &format!("agents/v2/connections/{id}"),
            "DELETE",
            false
        ));
        assert!(permitted_method(
            &format!("agents/v2/mcp/servers/{id}/reads"),
            "PUT",
            true
        ));
        let browser = format!("agents/v2/agents/{id}/browser");
        assert!(
            permitted_method(&browser, "PUT", true) && permitted_method(&browser, "DELETE", false)
        );
        assert!(
            !permitted_method(&browser, "PUT", false)
                && !permitted_method(&browser, "DELETE", true)
        );
        for (path, method, body) in [
            (grant.clone(), "PUT", false),
            (grant.clone(), "DELETE", true),
            (grant.clone(), "PATCH", true),
            (format!("agents/v2/connections/{id}"), "PUT", true),
            ("agents/v2/connections/gmail".to_string(), "DELETE", false),
            (format!("agents/v2/mcp/servers/{id}/reads"), "DELETE", false),
            (format!("agents/v2/mcp/servers/{id}"), "DELETE", false),
            (
                format!("agents/v2/agents/{id}/grants/not-a-uuid"),
                "PUT",
                true,
            ),
            (format!("agents/v2/triggers/{id}"), "PUT", true),
        ] {
            assert!(!permitted_method(&path, method, body), "{method} {path}");
        }
        for path in [
            "agents/v2/connections/Gmail/start".to_string(),
            "agents/v2/connections/1gmail/start".to_string(),
            "agents/v2/connections/g/start".to_string(),
            "agents/v2/connections/../start".to_string(),
            "agents/v2/connections/flows/not-a-uuid".to_string(),
            "agents/v2/connections/gmail/start?x=1".to_string(),
            "agents/v2/catalogue?x=1".to_string(),
            "agents/v2/local-mcp?hostId=x".to_string(),
            "agents/v2/local-mcp/servers".to_string(),
            format!("agents/v2/agents/{id}/grants?x=1"),
            "agents/v2/agents/not-a-uuid/grants".to_string(),
            format!("agents/v2/mcp/servers/{id}/tools"),
            "agents/v2/mcp/callback".to_string(),
            "agents/v2/mcp/client-metadata.json".to_string(),
            "agents/v2/composio/airtable/start".to_string(),
            format!("agents/v2/connections/{id}"),
        ] {
            assert!(
                !permitted(&path, false) && !permitted(&path, true),
                "{path}"
            );
        }
    }
}
