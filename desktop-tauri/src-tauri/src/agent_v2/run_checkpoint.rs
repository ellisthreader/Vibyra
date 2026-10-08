//! Release the old attempt only after its provider process and broker have stopped.
use super::{Control, Outcome, RunnerApi};
use std::sync::atomic::Ordering;

pub(super) async fn checkpoint_if_steered(
    api: &RunnerApi,
    run: &str,
    generation: u64,
    control: &Control,
    outcome: Outcome,
) -> Outcome {
    if outcome != Outcome::Steered && !control.steering.load(Ordering::SeqCst) {
        return outcome;
    }
    // Session::stop has completed before this call. A lost reply is safe: the lease eventually expires;
    // backend claim refuses in-flight actions and includes receipts instead of replaying them.
    let _ = api.checkpoint(run, generation).await;
    Outcome::Steered
}
