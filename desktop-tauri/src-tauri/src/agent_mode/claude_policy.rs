//! The CLI may not inherit user/project allow rules or silently remove its sandbox.
use serde_json::json;
use vibyra_core::{agent_model::PlaceAccess, agent_runs::RunSpec};

pub fn args(spec: &RunSpec) -> Result<Vec<String>, String> {
    let read: Vec<_> = spec.places.iter().map(|p| p.path.as_str()).collect();
    let write: Vec<_> = spec
        .places
        .iter()
        .filter(|p| spec.permission.writes() && p.access == PlaceAccess::ReadWrite)
        .map(|p| p.path.as_str())
        .collect();
    let mut deny_write: Vec<String> = spec
        .places
        .iter()
        .filter(|p| p.access == PlaceAccess::Read)
        .map(|p| p.path.clone())
        .collect();
    if !spec.permission.writes() {
        deny_write.push("/".into());
    }
    for place in spec
        .places
        .iter()
        .filter(|p| spec.permission.writes() && p.access == PlaceAccess::ReadWrite)
    {
        for private in [".git", ".codex", ".claude"] {
            deny_write.push(
                std::path::Path::new(&place.path)
                    .join(private)
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    let mut allow_read = vec!["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/dev"];
    allow_read.extend(read.iter().copied());
    let tools = [
        "Read",
        "Glob",
        "Grep",
        "Bash",
        "Edit",
        "Write",
        "NotebookEdit",
        "WebSearch",
        "WebFetch",
    ];
    let settings = json!({
        "permissions":{"ask":tools,"additionalDirectories":read,"blockReadsOutsideWorkingDirectories":true},
        "sandbox":{
            "enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false,
            "autoAllowBashIfSandboxed":false,"excludedCommands":[],
            "filesystem":{"allowRead":allow_read,"denyRead":read_denies()?,"allowWrite":write,"denyWrite":deny_write},
            "network":{"allowedDomains":[],"allowLocalBinding":false,"allowAllUnixSockets":false}
        }
    });
    Ok(vec![
        "--settings".into(),
        settings.to_string(),
        "--setting-sources".into(),
        String::new(),
        "--strict-mcp-config".into(),
        "--tools".into(),
        tools.join(","),
        "--allowedTools".into(),
        "mcp__vibyra__propose_memory,mcp__vibyra__propose_skill,mcp__vibyra__integration_accounts,mcp__vibyra__integration_read".into(),
    ])
}

fn read_denies() -> Result<Vec<String>, String> {
    if !cfg!(target_os = "linux") {
        return Ok(vec!["/".into()]);
    }
    // Claude's root-deny expansion masks /usr before /lib on usr-merged
    // Ubuntu; /lib then points into an empty mount and bwrap cannot start.
    // Deny each non-runtime root instead, keeping the same runtime reads.
    // /proc and /dev are replaced by the provider's private PID/device mounts.
    let runtime = ["usr", "bin", "sbin", "lib", "lib64", "etc", "dev", "proc"];
    std::fs::read_dir("/")
        .map_err(|e| e.to_string())?
        .map(|entry| {
            entry.map_err(|e| e.to_string()).map(|e| {
                (!runtime.iter().any(|name| e.file_name() == *name))
                    .then(|| e.path().to_string_lossy().into_owned())
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|paths| paths.into_iter().flatten().collect())
}
