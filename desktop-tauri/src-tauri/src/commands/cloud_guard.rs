//! Desktop UI admission only. Background sync keeps its existing consent gates.
use crate::state::AppState;
use vibyra_host::TrustedConnections;

pub(crate) const PHONE_REQUIRED: &str = "Connect a trusted iPhone to use Vibyra Cloud here.";
static MUTATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) fn mutation() -> Result<tokio::sync::MutexGuard<'static, ()>, String> {
    MUTATION
        .try_lock()
        .map_err(|_| "Vibyra Cloud is updating. Wait a moment and try again.".into())
}

#[derive(Clone)]
pub(crate) struct CloudSession {
    pub token: String,
    pub epoch: u64,
    pub(super) sockets: TrustedConnections,
}

impl CloudSession {
    pub fn run_engine<T>(
        &self,
        state: &AppState,
        slot: &crate::cloud_sync_task::EngineSlot,
        action: impl FnOnce(&vibyra_sync::Engine) -> Result<T, String>,
    ) -> Result<T, String> {
        self.check(state)?;
        let engine = slot
            .engine(
                &self.token,
                &crate::account_api::base_url(),
                crate::account_api::app_version(),
            )
            .map_err(|e| e.to_string())?;
        let result = action(&engine)?;
        self.check(state)?;
        Ok(result)
    }

    pub fn capture(state: &AppState) -> Result<Self, String> {
        let (token, epoch) = state
            .account
            .signed_in_authority()
            .ok_or("Sign in to Vibyra first.")?;
        let sockets = state.account.with_authority(&token, epoch, || {
            state.phone.lock().host()?.trusted_connections()
        })??;
        Ok(Self {
            token,
            epoch,
            sockets,
        })
    }

    pub fn check(&self, state: &AppState) -> Result<(), String> {
        state.account.with_authority(&self.token, self.epoch, || {
            if state
                .phone
                .lock()
                .host()
                .is_ok_and(|host| host.has_trusted_connection(&self.sockets))
            {
                Ok(())
            } else {
                Err(PHONE_REQUIRED.into())
            }
        })?
    }
}
