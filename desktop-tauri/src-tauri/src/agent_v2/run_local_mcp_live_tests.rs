//! Opt-in real backend, real Claude and scoped filesystem MCP acceptance.
use super::*;
use crate::agent_v2::{api::send, claude_cmd::find_program, registration};
use reqwest::Method;
use serde_json::json;
use vibyra_core::local_mcp::{store, Limits, SecretSource, ServerSpec, Supervisor};

#[path = "run_local_mcp_live_user.rs"]
mod user;
use user::User;
struct NoSecrets;
impl SecretSource for NoSecrets {
    fn read(&self, _: &str, _: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}

#[test]
#[ignore = "real backend and selected Claude account; needs MCP_QA_SESSION and VIBYRA_BROKER_BIN"]
fn live_local_mcp_read_and_exact_approved_write() {
    let session: Value =
        serde_json::from_slice(&std::fs::read(std::env::var("MCP_QA_SESSION").unwrap()).unwrap())
            .unwrap();
    assert_eq!(
        session["userId"], 77,
        "Only the disposable acceptance account"
    );
    let user = User {
        base: session["base"].as_str().unwrap().into(),
        token: session["token"].as_str().unwrap().into(),
    };
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("files");
    std::fs::create_dir(&folder).unwrap();
    let input = folder.join("input.txt");
    let output = folder.join("receipt.txt");
    std::fs::write(&input, "MCP live receipt 42").unwrap();
    let sup = Supervisor::new(Limits::default(), Arc::new(NoSecrets));
    let mut spec = ServerSpec {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Disposable filesystem MCP acceptance".into(),
        command: "npx".into(),
        args: vec![
            "-y".into(),
            "@modelcontextprotocol/server-filesystem@2026.8.31".into(),
            folder.to_string_lossy().into(),
        ],
        cwd: Some(folder.to_string_lossy().into()),
        enabled: true,
        ..ServerSpec::default()
    };
    let tools = sup.list_tools(&spec).unwrap();
    let host = "d".repeat(64); // isolated QA runtime, never the owner's binding
    let selection = Selection {
        provider: "claude".into(),
        account: "default".into(),
        model: std::env::var("V2_MODEL").unwrap_or_else(|_| "opus".into()),
        effort: None,
    };
    let program = find_program("claude").unwrap();
    tauri::async_runtime::block_on(async {
        let (runtime, key) = registration::register(
            &user.base,
            &user.token,
            registration::payload(&host, &selection, &registration::provider_version(&program)),
        )
        .await
        .unwrap();
        let api = RunnerApi {
            base: user.base.clone(),
            runtime_id: runtime.clone(),
            key,
        };
        let server = user
            .call(
                Method::POST,
                "local-mcp/servers",
                json!({"hostId":host,"localId":spec.id,"name":spec.name,
            "tools":tools.iter().map(|t|t.catalogue()).collect::<Vec<_>>() }),
            )
            .await["server"]
            .clone();
        let connection = server["connectionId"].as_str().unwrap();
        spec.connection_id = Some(connection.into());
        store::upsert(dir.path(), spec.clone()).unwrap();
        let named = |remote| {
            server["tools"]
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["remoteName"] == remote)
                .unwrap()["tool"]
                .as_str()
                .unwrap()
                .to_owned()
        };
        let read = named("read_text_file");
        let write = named("write_file");
        user.call(
            Method::PUT,
            &format!("local-mcp/servers/{connection}/reads"),
            json!({"tools":[read]}),
        )
        .await;
        let agent = user.teammate().await;
        user.call(
            Method::PUT,
            &format!("agents/{agent}/grants/{connection}"),
            json!({"operations":[read,write]}),
        )
        .await;
        let prompt = format!("Use only the provided MCP tools. First call {read} with path {}. Then call {write} with path {} and content exactly MCP live receipt 42. Wait for approval if required. Finish with MCP QA done. Do not access any other paths or services.",input.display(),output.display());
        let admitted = user
            .call(
                Method::POST,
                "runs",
                json!({"agentId":agent,"runtimeId":runtime,"prompt":prompt,
            "idempotencyKey":format!("mcp-qa-{}",uuid::Uuid::new_v4())}),
            )
            .await;
        let run_id = admitted["run"]["id"].as_str().unwrap();
        // Offline means queued: the file must not appear before a runner claims.
        tokio::time::sleep(Duration::from_secs(3)).await;
        assert!(!output.exists());
        let claimed = api.claim().await.unwrap().unwrap();
        assert_eq!(claimed["id"], run_id);
        let worker = crate::agent_v2_local_mcp::live_support::poll(
            api.clone(),
            &claimed,
            sup.clone(),
            dir.path().into(),
        );
        let approval = user.approve_exact(run_id, &write, &output);
        let account = Account {
            program,
            config_dir: None,
            memory_roots: vec![dirs::home_dir().unwrap().join(".claude")],
        };
        let execution = run(
            api,
            claimed,
            selection,
            account,
            Arc::new(Control::default()),
        );
        let (outcome, approved) = tokio::time::timeout(Duration::from_secs(240), async {
            tokio::join!(execution, approval)
        })
        .await
        .unwrap();
        worker.abort();
        assert_eq!(outcome, Outcome::Completed);
        assert!(approved);
        assert_eq!(
            std::fs::read_to_string(&output).unwrap(),
            "MCP live receipt 42"
        );
        let result = user
            .call(Method::GET, &format!("runs/{run_id}"), Value::Null)
            .await;
        let actions = result["run"]["actions"].as_array().unwrap();
        assert!(actions
            .iter()
            .any(|a| a["tool"] == read && a["state"] == "completed"));
        assert_eq!(
            actions
                .iter()
                .filter(|a| a["tool"] == write && a["state"] == "completed")
                .count(),
            1
        );
        eprintln!("PASS production local MCP run {run_id}: real filesystem read, exact approval, one write receipt");
        user.review_change(&host, &spec, &tools, connection).await;
        user.call(
            Method::DELETE,
            &format!("local-mcp/servers/{connection}"),
            Value::Null,
        )
        .await;
        user.call(Method::DELETE, &format!("runtimes/{runtime}"), Value::Null)
            .await;
    });
    sup.stop_all();
}
