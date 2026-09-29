//! Native-only restrictive reconciliation also runs while the UI is suspended.
use crate::state::AppState;
use tauri::{AppHandle, Manager};
use vibyra_host::{RestrictionBatch, RestrictionCheckpoint};
#[path = "restriction_fetch.rs"]
mod transport;

struct Captured {
    account: String,
    token: String,
    host: String,
    checkpoint: RestrictionCheckpoint,
}
impl Captured {
    fn capture(state: &AppState) -> Option<Self> {
        let token = state.account.token()?;
        let account = state.account.snapshot().profile?.welcome_key;
        let phone = state.phone.lock();
        let host = phone.host().ok()?;
        let checkpoint = host.restriction_checkpoint(&account).ok()??;
        Some(Self {
            account,
            token,
            host: host.id(),
            checkpoint,
        })
    }
    fn account_current(&self, state: &AppState) -> bool {
        state.account.token().as_deref() == Some(&self.token)
            && state
                .account
                .snapshot()
                .profile
                .is_some_and(|profile| profile.welcome_key == self.account)
    }
    fn current(&self, state: &AppState) -> bool {
        let phone = state.phone.lock();
        self.account_current(state)
            && phone
                .host()
                .is_ok_and(|host| self.checkpoint.check(host).is_ok())
    }
    fn suspend(&self, state: &AppState) {
        let phone = state.phone.lock();
        if self.account_current(state)
            && phone
                .host()
                .is_ok_and(|host| self.checkpoint.check(host).is_ok())
        {
            let _ = self.checkpoint.suspend();
        }
    }
    fn disable(&self, state: &AppState) -> Result<(), String> {
        let mut phone = state.phone.lock();
        if !self.account_current(state) {
            return Err("Account changed".into());
        }
        self.checkpoint.check(phone.host()?)?;
        // Both restrictions hold in memory even when either save fails.
        let cloud = phone.set_remote(false);
        let nearby = self.checkpoint.disable();
        cloud.and(nearby)
    }
    fn reject(&self, state: &AppState) {
        let mut phone = state.phone.lock();
        if !phone
            .host()
            .is_ok_and(|host| self.checkpoint.check(host).is_ok())
        {
            return;
        }
        state
            .account
            .reject_remote_token(&self.token, &self.account, || {
                phone.account_signed_out();
                let _ = phone.revoke_remote_devices(None);
                if let Ok(grants) = &state.preview_grants {
                    let _ = grants.revoke_all_devices();
                }
            });
    }
    fn finish(&self, state: &AppState, batch: RestrictionBatch) -> Result<(), String> {
        let phone = state.phone.lock();
        if !self.account_current(state) {
            return Err("Account changed".into());
        }
        self.checkpoint.check(phone.host()?)?;
        // Clean separate Preview consent before committing the durable cursor.
        // A failed grant-store save must cause this snapshot to be retried.
        let preview = (|| -> Result<(), String> {
            let grants = state.preview_grants.as_ref().map_err(Clone::clone)?;
            if batch.resets_trust() {
                grants.revoke_all_devices()?;
            } else {
                for key in batch.revoked_keys() {
                    grants.revoke_device(key)?;
                }
            }
            Ok(())
        })();
        if let Err(error) = preview {
            let _ = self.checkpoint.restrict_without_acknowledgement(batch);
            return Err(error);
        }
        self.checkpoint.finish(batch).map(|_| ())
    }
}
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            poll(&app.state::<AppState>()).await;
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    });
}
async fn poll(state: &AppState) {
    let Some(captured) = Captured::capture(state) else {
        return;
    };
    let mut batch = RestrictionBatch::new(captured.checkpoint.receipt.clone());
    for _ in 0..100 {
        let page = transport::fetch(
            &captured.token,
            &captured.host,
            batch.cursor(),
            batch.revision(),
        )
        .await;
        if !captured.current(state) {
            return;
        }
        let page = match page {
            Ok(page) => page,
            Err(transport::Failure::Unauthorized) => {
                // Reject the exact still-current bearer; preserve local CLI work.
                captured.reject(state);
                return;
            }
            Err(transport::Failure::Retry) => {
                captured.suspend(state);
                return;
            }
        };
        match batch.accept(&captured.host, page) {
            Ok(true) => {
                if captured.disable(state).is_err() {
                    captured.suspend(state);
                    return;
                }
            }
            Ok(false) => {}
            Err(_) => {
                captured.suspend(state);
                return;
            }
        }
        if batch.complete() {
            if captured.finish(state, batch).is_err() {
                captured.suspend(state);
            }
            return;
        }
        // Large histories must stay below the account/Host polling limit.
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
    }
    captured.suspend(state);
}
