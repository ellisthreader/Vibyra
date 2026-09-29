//! A captured native-only policy check is tied to this exact running Host.
use crate::{
    remote_restrictions::*, state::Shared, AuthorizationContext, EmbeddedHost, RegistrationProof,
};
use std::sync::{atomic::Ordering, Arc};
pub struct RestrictionCheckpoint {
    shared: Arc<Shared>,
    pub receipt: RestrictionReceipt,
    epoch: u64,
}
impl EmbeddedHost {
    /// Starting a Cloud leg cannot reuse unattended local consent before its
    /// account-bound control snapshot has been reconciled.
    pub fn require_restriction_sync(&self) {
        self.shared.suspend_restrictions();
    }
    pub fn restriction_checkpoint(
        &self,
        account: &str,
    ) -> Result<Option<RestrictionCheckpoint>, String> {
        let _writes = self
            .shared
            .writes
            .lock()
            .map_err(|_| "Identity unavailable")?;
        let receipt = self
            .shared
            .identity
            .lock()
            .map_err(|_| "Identity unavailable")?
            .restrictions
            .clone();
        Ok(receipt
            .filter(|receipt| receipt.account_scope == account)
            .map(|receipt| RestrictionCheckpoint {
                shared: self.shared.clone(),
                receipt,
                epoch: self.shared.policy_epoch.load(Ordering::SeqCst),
            }))
    }
}
impl RegistrationProof {
    pub fn bind_restriction_context(
        &self,
        account: &str,
        context: &AuthorizationContext,
    ) -> Result<(), String> {
        self.0
            .bind_restrictions(account, &context.user_id, context.generation)
    }
}
impl RestrictionCheckpoint {
    pub fn check(&self, host: &EmbeddedHost) -> Result<(), String> {
        if !Arc::ptr_eq(&self.shared, &host.shared) {
            return Err("Computer restarted".into());
        }
        self.shared.check_restrictions(&self.receipt, self.epoch)
    }
    pub fn suspend(&self) -> Result<(), String> {
        let _writes = self
            .shared
            .writes
            .lock()
            .map_err(|_| "Identity unavailable")?;
        self.shared.check_restrictions(&self.receipt, self.epoch)?;
        self.shared.suspend_restrictions();
        Ok(())
    }
    pub fn disable(&self) -> Result<(), String> {
        self.shared
            .apply_restriction_disable(&self.receipt, self.epoch)
    }
    pub fn finish(&self, batch: RestrictionBatch) -> Result<Vec<String>, String> {
        if batch.receipt != self.receipt {
            return Err("Remote security scope changed".into());
        }
        self.shared.apply_restrictions(batch, self.epoch, true)
    }
    /// Companion stores failed to persist their restrictions. Still stop Host
    /// access, but retry this complete snapshot instead of advancing its cursor.
    pub fn restrict_without_acknowledgement(
        &self,
        batch: RestrictionBatch,
    ) -> Result<Vec<String>, String> {
        if batch.receipt != self.receipt {
            return Err("Remote security scope changed".into());
        }
        self.shared.apply_restrictions(batch, self.epoch, false)
    }
}
