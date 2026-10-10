//! Sidecars belong to one run; task cancellation is cooperative and awaited by the pool.
use crate::agent_v2::{
    api::RunnerApi,
    execute::{Control, Outcome},
    run::{run, Account},
    selection::Selection,
};
use serde_json::Value;
use std::sync::Arc;
use tauri::{async_runtime::JoinHandle, AppHandle};
struct Providers(Vec<JoinHandle<()>>);
impl Drop for Providers {
    fn drop(&mut self) {
        for task in &self.0 {
            task.abort();
        }
    }
}
pub async fn execute(
    app: AppHandle,
    api: RunnerApi,
    claim: Value,
    selection: Selection,
    account: Account,
    control: Arc<Control>,
    _bound: crate::agent_v2::session_bound::Bound,
) -> Outcome {
    let _providers = Providers(vec![
        crate::agent_v2_computer::spawn(app.clone(), api.clone(), &claim),
        crate::agent_v2_browser::spawn(app.clone(), api.clone(), &claim),
        crate::agent_v2_local_mcp::spawn(app, api.clone(), &claim),
    ]);
    run(api, claim, selection, account, control).await
}
