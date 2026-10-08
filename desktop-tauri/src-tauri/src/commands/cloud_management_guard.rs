//! Managing previously consented Cloud is distinct from setting up a new connection.
use super::{
    cloud_guard::{CloudSession, PHONE_REQUIRED},
    cloud_page::CloudOverview,
};
use crate::cloud_management::policy::{eligible, registered, same_phone};
use crate::{
    cloud_management::{account_binding, Receipt},
    state::AppState,
};

#[derive(Clone)]
pub(crate) struct ManagementSession {
    pub token: String,
    pub epoch: u64,
    proof: Proof,
}
#[derive(Clone)]
enum Proof {
    Live(CloudSession),
    Existing(Receipt),
}
fn binding(state: &AppState) -> Result<String, String> {
    Ok(account_binding(
        &state
            .account
            .snapshot()
            .profile
            .ok_or("Sign in first.")?
            .welcome_key,
    ))
}
fn matches_phone(state: &AppState, receipt: &Receipt) -> bool {
    let phone = state.phone.lock();
    let status = phone.status(true);
    phone
        .host()
        .is_ok_and(|host| same_phone(receipt, &host.id(), &status))
}
impl ManagementSession {
    pub fn capture(state: &AppState) -> Result<Self, String> {
        let (token, epoch) = state
            .account
            .signed_in_authority()
            .ok_or("Sign in to Vibyra first.")?;
        let receipt = state.cloud_management.current().filter(|r| {
            binding(state).is_ok_and(|account| account == r.account) && matches_phone(state, r)
        });
        let proof = match receipt {
            Some(receipt) => Proof::Existing(receipt),
            None => Proof::Live(CloudSession::capture(state)?),
        };
        let session = Self {
            token,
            epoch,
            proof,
        };
        session.check(state)?;
        Ok(session)
    }
    pub fn check(&self, state: &AppState) -> Result<(), String> {
        match &self.proof {
            Proof::Live(session) => session.check(state),
            Proof::Existing(receipt) => {
                // Capture the public binding before taking the account lock; never re-enter it.
                let account = binding(state)?;
                state.account.with_authority(&self.token, self.epoch, || {
                    if account == receipt.account
                        && state.cloud_management.current().as_ref() == Some(receipt)
                        && matches_phone(state, receipt)
                    {
                        Ok(())
                    } else {
                        Err(PHONE_REQUIRED.into())
                    }
                })?
            }
        }
    }
    pub async fn read(&self, state: &AppState) -> Result<CloudOverview, String> {
        self.check(state)?;
        let overview = match &self.proof {
            Proof::Live(session) => super::cloud_page::read(state, session).await?,
            Proof::Existing(receipt) => {
                let overview = super::cloud_page::fetch(&self.token).await?;
                let hosts = crate::account_api::request(
                    crate::account_api::Endpoint::RemoteHosts,
                    Some(&self.token),
                    None,
                )
                .await
                .map_err(|e| e.message().to_owned())?;
                self.check(state)?;
                if !eligible(&overview) || !registered(&hosts, &receipt.host) {
                    state.account.with_authority(&self.token, self.epoch, || {
                        if state.cloud_management.revoke_matching(Some(receipt))? {
                            Ok(())
                        } else {
                            Err(PHONE_REQUIRED.to_owned())
                        }
                    })??;
                    return Err(
                        "Reconnect an approved iPhone to review Vibyra Cloud access.".into(),
                    );
                }
                overview
            }
        };
        self.check(state)?;
        Ok(overview)
    }
    pub fn validate_provider(&self, state: &AppState, provider: &str) -> Result<(), String> {
        let overview = tauri::async_runtime::block_on(self.read(state))?;
        if !eligible(&overview) || overview.access["providers"][provider]["enabled"] != true {
            return Err("Turn this account on for Vibyra Cloud first.".into());
        }
        self.check(state)
    }
}
pub(crate) async fn remember(
    state: &AppState,
    session: &CloudSession,
    overview: &CloudOverview,
    expected: Option<&Receipt>,
) -> Result<(), String> {
    session.check(state)?;
    if !eligible(overview) {
        state
            .account
            .with_authority(&session.token, session.epoch, || {
                let phone = state.phone.lock();
                if !phone.host()?.has_trusted_connection(&session.sockets) {
                    return Err(PHONE_REQUIRED.to_owned());
                }
                if state.cloud_management.revoke_matching(expected)? {
                    Ok(())
                } else {
                    Err(PHONE_REQUIRED.to_owned())
                }
            })??;
        return Ok(());
    }
    session.check(state)?;
    let host = state.phone.lock().host()?.id();
    let hosts = crate::account_api::request(
        crate::account_api::Endpoint::RemoteHosts,
        Some(&session.token),
        None,
    )
    .await
    .map_err(|e| e.message().to_owned())?;
    session.check(state)?;
    if !registered(&hosts, &host) {
        return Ok(());
    }
    let account = binding(state)?;
    state
        .account
        .with_authority(&session.token, session.epoch, || {
            let phone = state.phone.lock();
            let device = phone
                .host()?
                .admitted_device(&session.sockets)
                .ok_or(PHONE_REQUIRED)?;
            if phone.host()?.id() != host || device.created_at.is_empty() {
                return Err(PHONE_REQUIRED.into());
            }
            state.cloud_management.mint(Receipt {
                account,
                host,
                device: device.id,
                approved_at: device.created_at,
                generation: uuid::Uuid::new_v4().to_string(),
            })
        })?
}
pub(crate) fn availability(state: &AppState) -> Option<String> {
    state.account.signed_in_authority()?;
    let receipt = state.cloud_management.current()?;
    (binding(state).ok()? == receipt.account && matches_phone(state, &receipt))
        .then_some(receipt.generation)
}
