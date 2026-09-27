//! Fixed read-only virtual files. No caller-supplied command or shell arguments.
use serde_json::{json, Value};

const GUIDE: &str = "Railway is read-only. Read projects.json (or projects-page-N.json, pages start at 0) for project IDs. Read projects/PROJECT_UUID.json for its environments and services. Read projects/PROJECT_UUID/environments/ENV_UUID/services/SERVICE_UUID/deployments.json for the latest 10 deployments. Read projects/PROJECT_UUID/environments/ENV_UUID/services/SERVICE_UUID/deployments/DEPLOY_UUID/logs.txt for 40 recent log lines. Each read needs phone approval. Logs may contain sensitive application data despite best-effort redaction; only approve logs you want shared with the AI. No variables, deploys, restarts or writes are available.";

pub fn read(
    operation: &str,
    p: &Value,
    run: impl Fn(&[&str]) -> Result<String, String>,
) -> Result<Value, String> {
    let path = p["path"].as_str().ok_or("Missing Railway resource")?;
    if operation == "list_files" {
        if !path.is_empty() {
            return Err("Read README.md for Railway resource paths.".into());
        }
        return Ok(
            json!({"path":"","entries":[{"name":"README.md","path":"README.md","kind":"file","size":0},{"name":"projects.json","path":"projects.json","kind":"file","size":0}]}),
        );
    }
    if operation != "read_file" {
        return Err("Railway only supports approved reads.".into());
    }
    let content = if path == "README.md" {
        GUIDE.to_owned()
    } else if path == "projects.json" || path.starts_with("projects-page-") {
        let page = if path == "projects.json" {
            0
        } else {
            path.strip_prefix("projects-page-")
                .and_then(|s| s.strip_suffix(".json"))
                .and_then(|s| s.parse::<usize>().ok())
                .filter(|n| *n < 10000)
                .ok_or("Invalid project page")?
        };
        let list = parse(&run(&["list", "--json"])?)?;
        let list = list
            .as_array()
            .ok_or("Railway returned an invalid project list")?;
        let entries: Vec<_> = list.iter().skip(page * 20).take(20).map(named).collect();
        json!({"projects":entries,"nextPage":if (page+1)*20 < list.len() {json!(format!("projects-page-{}.json",page+1))} else {Value::Null}}).to_string()
    } else {
        let parts: Vec<_> = path.split('/').collect();
        match parts.as_slice() {
            ["projects", file] if file.ends_with(".json") => {
                let id = file.trim_end_matches(".json");
                valid_id(id)?;
                let list = parse(&run(&["list", "--json"])?)?;
                let project = list
                    .as_array()
                    .and_then(|a| a.iter().find(|v| v["id"] == id))
                    .ok_or("Railway project not found")?;
                json!({"project":named(project),"environments":nodes(&project["environments"]),"services":nodes(&project["services"])}).to_string()
            }
            ["projects", project, "environments", env, "services", service, "deployments.json"] => {
                for id in [project, env, service] {
                    valid_id(id)?;
                }
                let list = parse(&run(&[
                    "deployment",
                    "list",
                    "--project",
                    project,
                    "--environment",
                    env,
                    "--service",
                    service,
                    "--limit",
                    "10",
                    "--json",
                ])?)?;
                let list = list
                    .as_array()
                    .ok_or("Railway returned invalid deployments")?;
                let entries: Vec<_> = list
                    .iter()
                    .take(10)
                    .map(|d| json!({"id":d["id"],"status":d["status"],"createdAt":d["createdAt"]}))
                    .collect();
                json!({"deployments":entries,"limit":10}).to_string()
            }
            ["projects", project, "environments", env, "services", service, "deployments", deployment, "logs.txt"] =>
            {
                for id in [project, env, service, deployment] {
                    valid_id(id)?;
                }
                let output = run(&[
                    "logs",
                    deployment,
                    "--project",
                    project,
                    "--environment",
                    env,
                    "--service",
                    service,
                    "--lines",
                    "40",
                    "--json",
                ])?;
                output
                    .lines()
                    .take(40)
                    .map(redact)
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            _ => {
                return Err("Unknown Railway resource. Read README.md for supported paths.".into())
            }
        }
    };
    if content.len() > 8192 {
        return Err(
            "Railway result exceeds 8 KB. Choose a smaller resource; no partial JSON was returned."
                .into(),
        );
    }
    Ok(json!({"path":path,"content":content,"readOnly":true}))
}
fn parse(text: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|_| "Railway returned invalid JSON".into())
}
fn named(v: &Value) -> Value {
    json!({"id":v["id"],"name":v["name"].as_str().unwrap_or("").chars().take(160).collect::<String>()})
}
fn nodes(v: &Value) -> Value {
    let entries: Vec<_> = v["edges"]
        .as_array()
        .into_iter()
        .flatten()
        .take(50)
        .map(|e| named(&e["node"]))
        .collect();
    json!({"entries":entries,"truncated":v["edges"].as_array().is_some_and(|a| a.len()>50)})
}
fn valid_id(id: &str) -> Result<(), String> {
    if id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        Ok(())
    } else {
        Err("Railway resource requires a UUID".into())
    }
}
fn redact(line: &str) -> String {
    let lower = line.to_ascii_lowercase();
    if [
        "secret",
        "token",
        "password",
        "passwd",
        "authorization",
        "api_key",
        "apikey",
        "api-key",
        "private_key",
        "private key",
        "cookie",
        "bearer ",
        "postgres://",
        "postgresql://",
        "mysql://",
        "redis://",
        "sk_live_",
        "sk_test_",
        "ghp_",
        "github_pat_",
        "eyj",
    ]
    .iter()
    .any(|s| lower.contains(s))
    {
        "[redacted potentially sensitive log line]".into()
    } else {
        if line.chars().count() > 160 {
            format!("{} [truncated]", line.chars().take(140).collect::<String>())
        } else {
            line.to_owned()
        }
    }
}
#[cfg(test)]
#[path = "railway_resources_tests.rs"]
mod resource_tests;
