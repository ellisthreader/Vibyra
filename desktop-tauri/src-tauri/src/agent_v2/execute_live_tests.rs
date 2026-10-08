//! One real Claude Code run through the real broker (this app's binary in
//! broker mode) against a loopback mock backend with a fake Gmail. It uses the
//! Mac's Claude login, so it only runs explicitly:
//! `VIBYRA_BROKER_BIN=target/debug/vibyra-desktop cargo test --lib live_claude -- --ignored`

use super::*;
use crate::agent_v2::api::RunnerApi;
use crate::agent_v2::broker::BrokerConfig;
use crate::agent_v2::claude_cmd::{build, find_program, project_dir_name, LaunchInput};
use crate::agent_v2::mock_http::MockServer;
use crate::agent_v2::tools::{expose, qualified_names};
use crate::agent_v2::workspace::Workspace;
use serde_json::json;
use std::path::PathBuf;

const RUN: &str = "11111111-1111-4111-8111-111111111111";
const RT: &str = "22222222-2222-4222-8222-222222222222";

struct Live {
    api: RunnerApi,
    rt: tokio::runtime::Runtime,
}

impl Backend for Live {
    fn events(&self, events: &[(&str, String)]) -> Result<(), ApiError> {
        self.rt.block_on(self.api.events(RUN, 1, events))
    }
    fn complete(&self, answer: &str) -> Result<(), ApiError> {
        self.rt.block_on(self.api.complete(RUN, 1, answer))
    }
    fn fail(&self, code: &str, reason: &str) -> Result<(), ApiError> {
        self.rt.block_on(self.api.fail(RUN, 1, code, reason))
    }
}

#[test]
#[ignore]
fn live_claude_code_run_uses_only_the_broker() {
    let broker_bin = PathBuf::from(std::env::var("VIBYRA_BROKER_BIN").unwrap())
        .canonicalize()
        .unwrap();
    let server = MockServer::start(|request| {
        let body = if request.path.ends_with("/tools") {
            json!({"action": {"id": "act-1", "callId": request.body["callId"], "tool": "gmail_search",
                "kind": "read", "state": "completed", "summary": "Searched mail",
                "result": {"messages": [{"id": "m1", "from": "Ada <ada@example.com>",
                    "subject": "Lunch moved to 1pm", "snippet": "See you then."}]}}})
        } else {
            json!({"eventCursor": 1, "run": {"state": "completed"}})
        };
        (200, body.to_string())
    });
    let manifest = json!({"revision": "0000000000000001", "tools": [{"tool": "gmail_search",
        "connectionId": "aaaaaaaa-0000-4000-8000-000000000001", "provider": "gmail",
        "account": "me@example.com", "kind": "read", "requiresApproval": false,
        "schemaRevision": "rev000000001", "description": "Search the person's Gmail.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}]});
    let config = BrokerConfig {
        base: server.base.clone(),
        runtime_id: RT.into(),
        key: "k".repeat(64),
        run_id: RUN.into(),
        generation: 1,
        manifest: manifest.clone(),
        armed_path: None,
    };
    let workspace = Workspace::create(&broker_bin, &config).unwrap();
    let allowed = qualified_names(&expose(&manifest).unwrap());
    let home = dirs::home_dir().unwrap();
    let launch = build(&LaunchInput {
        program: &find_program("claude").expect("claude on PATH"),
        mcp_config: &workspace.mcp_config,
        allowed_tools: &allowed,
        model: "haiku",
        effort: None,
        workdir: &workspace.work,
        home: &home,
        user: &std::env::var("USER").unwrap(),
        tmpdir: &std::env::temp_dir(),
        config_dir: None,
    });
    let plan = Plan {
        launch,
        prompt: "Use gmail_search with the query \"is:unread\", then tell me the subject of the \
                 newest email in one short sentence."
            .into(),
        attachments: Vec::new(),
        expected_tools: allowed,
        armed_path: workspace.armed.clone(),
        wall: Duration::from_secs(180),
        interrupt_grace: Duration::from_secs(8),
    };
    let backend = Live {
        api: RunnerApi {
            base: server.base.clone(),
            runtime_id: RT.into(),
            key: "k".repeat(64),
        },
        rt: tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap(),
    };
    let outcome = execute(&plan, &backend, &Control::default());
    let requests = server.requests.lock().unwrap().clone();
    for request in &requests {
        eprintln!("{} {} {}", request.method, request.path, request.body);
    }
    assert_eq!(outcome, Outcome::Completed);
    let tool = requests
        .iter()
        .find(|r| r.path.ends_with("/tools"))
        .expect("broker call");
    assert_eq!(tool.body["tool"], "gmail_search");
    assert_eq!(tool.body["generation"], 1);
    let complete = requests
        .iter()
        .find(|r| r.path.ends_with("/complete"))
        .unwrap();
    assert!(complete.body["answer"].as_str().unwrap().contains("Lunch"));
    let memory = home
        .join(".claude/projects")
        .join(project_dir_name(&workspace.work));
    workspace.cleanup(&[home.join(".claude")]);
    assert!(!memory.exists());
}
