//! Native per-session disconnect revokes the exact signed capability locally.
use crate::{
    remote_authorization::{now, Authorization},
    state::Shared,
};
use std::sync::Arc;
impl Shared {
    pub(crate) fn register_authorization(&self, grant: &Arc<Authorization>) -> Result<(), String> {
        let mut live = self
            .remote_authorizations
            .lock()
            .map_err(|_| "Remote sessions unavailable")?;
        live.retain(|grant| grant.strong_count() > 0);
        if live.len() >= 64 {
            return Err("Too many remote sessions".into());
        }
        live.push(Arc::downgrade(grant));
        Ok(())
    }
    pub(crate) fn revoke_remote_session(&self, session: &str) -> Result<(), String> {
        let mut used = self
            .used_remote_grants
            .lock()
            .map_err(|_| "Remote sessions unavailable")?;
        used.retain(|_, expires| *expires > now());
        if used.len() >= 4096 && !used.contains_key(session) {
            return Err("Too many revoked sessions; disable all remote access".into());
        }
        used.insert(session.to_owned(), now().saturating_add(12 * 3600 + 30));
        drop(used);
        let mut live = self
            .remote_authorizations
            .lock()
            .map_err(|_| "Remote sessions unavailable")?;
        live.retain(|grant| {
            if let Some(grant) = grant.upgrade() {
                if grant.claims.session_id == session {
                    grant.revoke();
                }
                true
            } else {
                false
            }
        });
        Ok(())
    }
}
