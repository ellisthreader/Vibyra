//! Explicit production acceptance only; does not touch the app's account/settings.
use super::*;
use std::path::PathBuf;

pub(crate) fn poll(
    api: RunnerApi,
    claimed: &Value,
    supervisor: Arc<Supervisor>,
    dir: PathBuf,
) -> tauri::async_runtime::JoinHandle<()> {
    let lease = Lease {
        api,
        run: claimed["id"].as_str().unwrap().into(),
        generation: claimed["generation"].as_u64().unwrap(),
        secrets: claimed["guard"]["secrets"] == true,
    };
    tauri::async_runtime::spawn(async move {
        let engine = Engine { supervisor, dir };
        let mut unsent = HashMap::new();
        loop {
            for action in lease.list().await.expect("live local MCP actions") {
                if std::env::var_os("MCP_QA_RESTART_RECEIPT").is_some()
                    && action["state"] == "approved"
                    && action["server"]["remoteName"] == "write_file"
                {
                    restart_before_receipt(&engine, &lease, &action).await;
                    continue;
                }
                serve(&engine, &lease, &action, &mut unsent).await;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    })
}

async fn restart_before_receipt(engine: &Engine, lease: &Lease, action: &Value) {
    let job = map::job(action).expect("QA write job");
    assert!(job.is_write);
    let id = action["id"].as_str().unwrap();
    let (body, proceed) = preflight(engine, lease, action, &job).await;
    assert!(proceed);
    let claimed = lease.claim(id, body).await.unwrap();
    assert!(map::claimed_by(&claimed, lease.generation));
    let receipt = run(engine, &job, lease.secrets).await;
    let target = std::path::PathBuf::from(action["arguments"]["path"].as_str().unwrap());
    assert!(target.starts_with(&engine.dir));
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "MCP live receipt 42"
    );
    // Lose the in-memory receipt and stop the MCP child before acknowledgement.
    // A fresh worker must not execute this already-dispatched write again.
    engine.supervisor.stop_all();
    std::fs::write(&target, "QA restart sentinel").unwrap();
    let listed = lease.list().await.unwrap();
    let pending = listed.iter().find(|a| a["id"] == id).unwrap();
    assert_eq!(pending["state"], "dispatching");
    serve(engine, lease, pending, &mut HashMap::new()).await;
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "QA restart sentinel"
    );
    std::fs::write(&target, "MCP live receipt 42").unwrap();
    // Deliver the retained test receipt so this disposable run can finish.
    lease.receipt(id, &receipt).await.unwrap();
    eprintln!(
        "PASS production MCP child stopped before receipt; fresh worker did not replay the write"
    );
}
