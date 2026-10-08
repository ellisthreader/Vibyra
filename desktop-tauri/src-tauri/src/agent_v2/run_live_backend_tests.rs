//! The real runner path (register → claim → `run` → Claude Code → broker)
//! against a real Laravel backend. Uses the Mac's default Claude login, so it
//! only runs explicitly; runs are admitted/approved/cancelled with curl:
//! `V2_BASE=http://127.0.0.1:8177 V2_TOKEN=… V2_RUNS=1
//!  VIBYRA_BROKER_BIN=target/debug/vibyra-desktop cargo test --lib live_backend -- --ignored --nocapture`

use super::*;
use crate::agent_v2::api::RunnerApi;
use crate::agent_v2::claude_cmd::find_program;
use crate::agent_v2::registration;
use std::time::Instant;

fn env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

#[test]
#[ignore]
fn live_backend_runner_claims_and_runs() {
    let (base, token) = (env("V2_BASE", ""), env("V2_TOKEN", ""));
    let runs: usize = env("V2_RUNS", "1").parse().unwrap();
    let selection = Selection {
        provider: "claude".into(),
        account: "default".into(),
        model: env("V2_MODEL", "haiku"),
        effort: None,
    };
    // `V2_FAKE_CLAUDE`: a stand-in CLI (cancel proof without spending a live run).
    let program = std::env::var_os("V2_FAKE_CLAUDE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| find_program("claude").expect("claude on PATH"));
    let version = registration::provider_version(&program);
    let host = env("V2_HOST", &"e".repeat(64));
    let body = registration::payload(&host, &selection, &version);
    tauri::async_runtime::block_on(async move {
        let (runtime_id, key) = registration::register(&base, &token, body).await.unwrap();
        eprintln!("[e2e] registered runtime {runtime_id} (claude {version})");
        let api = RunnerApi {
            base,
            runtime_id,
            key,
        };
        let (mut done, started) = (0, Instant::now());
        while done < runs && started.elapsed() < Duration::from_secs(20 * 60) {
            let Some(claimed) = api.claim().await.unwrap() else {
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            };
            eprintln!(
                "[e2e] claimed {} generation {} tools {}",
                claimed["id"], claimed["generation"], claimed["tools"]["tools"]
            );
            let account = Account {
                program: program.clone(),
                config_dir: None,
                memory_roots: vec![dirs::home_dir().unwrap().join(".claude")],
            };
            let outcome = run(
                api.clone(),
                claimed,
                selection.clone(),
                account,
                Arc::new(Control::default()),
            )
            .await;
            eprintln!("[e2e] outcome {outcome:?}");
            done += 1;
        }
        assert_eq!(done, runs, "not every expected run was claimed");
        // Nothing parked or finished is re-offered, even past the 90 s lease.
        let hold = Instant::now();
        let secs: u64 = env("V2_HOLD_SECS", "0").parse().unwrap();
        loop {
            assert!(api.claim().await.unwrap().is_none(), "a run was re-offered");
            if hold.elapsed() >= Duration::from_secs(secs) {
                break;
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}
