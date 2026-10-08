//! One claimed run end to end: folders, broker config, Claude Code launch,
//! heartbeat, outcome, cleanup.

use super::api::{ApiError, RunnerApi};
use super::attachments::{self, Stop};
#[path = "run_heartbeat.rs"]
mod beat;
use super::broker::BrokerConfig;
use super::claude_cmd::{build, LaunchInput};
use super::execute::{execute, Backend, Control, Outcome, Plan};
use super::preflight::Refusal;
use super::selection::Selection;
use super::tools::{expose, qualified_names};
use super::workspace::Workspace;
use beat::heartbeat;
#[path = "run_checkpoint.rs"]
mod checkpoint;
use checkpoint::checkpoint_if_steered;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

struct LiveBackend {
    api: RunnerApi,
    run: String,
    generation: u64,
}

impl Backend for LiveBackend {
    fn events(&self, events: &[(&str, String)]) -> Result<(), ApiError> {
        tauri::async_runtime::block_on(self.api.events(&self.run, self.generation, events))
    }
    fn complete(&self, answer: &str) -> Result<(), ApiError> {
        tauri::async_runtime::block_on(self.api.complete(&self.run, self.generation, answer))
    }
    fn fail(&self, code: &str, reason: &str) -> Result<(), ApiError> {
        tauri::async_runtime::block_on(self.api.fail(&self.run, self.generation, code, reason))
    }
    fn pause(&self, reason: &str, resume_at: Option<i64>) -> Result<(), ApiError> {
        let (run, generation) = (&self.run, self.generation);
        tauri::async_runtime::block_on(
            self.api
                .fail_until(run, generation, "limits", reason, resume_at),
        )
    }
}

pub struct Account {
    pub program: PathBuf,
    /// `CLAUDE_CONFIG_DIR` for a non-default account.
    pub config_dir: Option<PathBuf>,
    /// Every folder whose `projects/` may hold this run's memory.
    pub memory_roots: Vec<PathBuf>,
}

pub async fn run(
    api: RunnerApi,
    claimed: Value,
    selection: Selection,
    account: Account,
    control: Arc<Control>,
) -> Outcome {
    let run_id = claimed["id"].as_str().unwrap_or_default().to_owned();
    let generation = claimed["generation"].as_u64().unwrap_or(0);
    let backend = LiveBackend {
        api: api.clone(),
        run: run_id.clone(),
        generation,
    };
    if !crate::agent_computer_access::looks_uuid(&run_id) || generation == 0 {
        return Outcome::Failed("invalid claim".into());
    }
    let tools = match expose(&claimed["tools"]) {
        Ok(tools) => tools,
        Err(reason) => return blocking_fail(backend, "runner_error", reason).await,
    };
    let broker_program = match broker_program() {
        Ok(path) => path,
        Err(_) => {
            return blocking_fail(
                backend,
                "runner_error",
                "Vibyra could not locate itself.".into(),
            )
            .await
        }
    };
    let config = BrokerConfig {
        base: api.base.clone(),
        runtime_id: api.runtime_id.clone(),
        key: api.key.clone(),
        run_id: run_id.clone(),
        generation,
        manifest: claimed["tools"].clone(),
        armed_path: None,
    };
    let workspace = match Workspace::create(&broker_program, &config) {
        Ok(workspace) => workspace,
        Err(reason) => return blocking_fail(backend, "runner_error", reason).await,
    };
    let done = Arc::new(AtomicBool::new(false));
    // The heartbeat starts first: fetching attachments can outlast the 90 s lease.
    let beat = tauri::async_runtime::spawn(heartbeat(
        api.clone(),
        run_id.clone(),
        generation,
        control.clone(),
        done.clone(),
    ));
    let saved = match attachments::fetch_all(&api, &claimed, &workspace.attachments, &control).await
    {
        Ok(saved) => saved,
        Err(stop) => {
            done.store(true, Ordering::SeqCst);
            beat.abort();
            workspace.cleanup(&account.memory_roots);
            let outcome = match stop {
                Stop::Fail(Refusal { code, reason }) => blocking_fail(backend, code, reason).await,
                Stop::Stale => Outcome::Stale,
                Stop::Cancelled => Outcome::Cancelled,
            };
            return checkpoint_if_steered(&api, &run_id, generation, &control, outcome).await;
        }
    };
    let home = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
    let user = std::env::var("USER").unwrap_or_default();
    let allowed = qualified_names(&tools);
    let launch = build(&LaunchInput {
        program: &account.program,
        mcp_config: &workspace.mcp_config,
        allowed_tools: &allowed,
        model: &selection.model,
        effort: selection.effort.as_deref(),
        workdir: &workspace.work,
        home: &home,
        user: &user,
        tmpdir: &std::env::temp_dir(),
        config_dir: account.config_dir.as_deref(),
    });
    let plan = Plan {
        launch,
        prompt: super::prompt::build(&claimed),
        attachments: attachments::blocks(&saved),
        expected_tools: allowed,
        armed_path: workspace.armed.clone(),
        wall: Duration::from_secs(60 * 60),
        interrupt_grace: Duration::from_secs(8),
    };
    let worker_control = control.clone();
    let worker = std::thread::spawn(move || execute(&plan, &backend, &worker_control));
    let mut touched = Instant::now();
    workspace.keep_alive();
    while !worker.is_finished() {
        tokio::time::sleep(Duration::from_millis(250)).await;
        if touched.elapsed() > Duration::from_secs(20) {
            workspace.keep_alive(); // the startup sweep must never mistake this run for a leftover
            touched = Instant::now();
        }
    }
    let outcome = worker
        .join()
        .unwrap_or(Outcome::Failed("runner panicked".into()));
    done.store(true, Ordering::SeqCst);
    beat.abort();
    workspace.cleanup(&account.memory_roots);
    checkpoint_if_steered(&api, &run_id, generation, &control, outcome).await
}

/// This app's own binary, started in broker mode. Tests run from the test
/// harness binary, so they name the built app with `VIBYRA_BROKER_BIN`.
fn broker_program() -> std::io::Result<PathBuf> {
    #[cfg(test)]
    if let Some(path) = std::env::var_os("VIBYRA_BROKER_BIN") {
        return PathBuf::from(path).canonicalize();
    }
    std::env::current_exe()
}

async fn blocking_fail(backend: LiveBackend, code: &'static str, reason: String) -> Outcome {
    let _ = tauri::async_runtime::spawn_blocking(move || backend.fail(code, &reason)).await;
    Outcome::Failed(code.into())
}

#[cfg(test)]
#[path = "run_live_backend_tests.rs"]
mod live_backend_tests;

#[cfg(test)]
#[path = "run_attachment_tests.rs"]
mod attachment_tests;
#[cfg(test)]
#[path = "run_local_mcp_live_tests.rs"]
mod local_mcp_live_tests;
