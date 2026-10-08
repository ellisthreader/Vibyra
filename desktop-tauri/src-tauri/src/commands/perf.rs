use super::run_blocking;
use crate::perf::{self, PerfSample};

/// One native performance reading, on demand.
///
/// `async fn` + `run_blocking` is mandatory here, not stylistic: sampling reads
/// `/proc` and, on the first call of the session, sleeps out sysinfo's minimum
/// CPU interval. A plain `fn` command would run that inline on the IPC thread
/// and freeze the UI — a perf probe that costs the performance it measures.
///
/// The renderer polls this from `usePerfWatch` (every 15 s, focus- and
/// activity-gated) rather than the app emitting events, so there is no
/// background sampler to leak when the window is hidden.
#[tauri::command]
pub async fn perf_sample() -> Result<PerfSample, String> {
    run_blocking(|| Ok(perf::sample())).await
}
