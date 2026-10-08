use crate::{lan_authorization::LanMode, remote_restrictions::*, state::Shared};
use std::sync::atomic::Ordering;
/// How long live phones survive a security sync that keeps failing.
pub(crate) const SYNC_GRACE: u64 = 120;
impl Shared {
    pub(crate) fn bind_restrictions(
        &self,
        account: &str,
        user: &str,
        generation: u64,
    ) -> Result<(), String> {
        if account.is_empty() || user.is_empty() || generation == 0 {
            return Err("Invalid remote security scope".into());
        }
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        if identity.restrictions.as_ref().is_some_and(|old| {
            old.account_scope == account && old.user_id == user && old.generation == generation
        }) {
            return Ok(());
        }
        self.policy_epoch.fetch_add(1, Ordering::SeqCst);
        self.policy_pending.store(true, Ordering::SeqCst);
        self.policy_failing_since.store(0, Ordering::SeqCst);
        let revision = identity
            .restrictions
            .as_ref()
            .filter(|old| old.account_scope == account && old.user_id == user)
            .map_or(0, |old| old.revision);
        let previous = identity.restrictions.clone();
        identity.restrictions = Some(RestrictionReceipt {
            account_scope: account.into(),
            user_id: user.into(),
            generation,
            revision,
        });
        // A failed write keeps unattended access suspended and Cloud fails closed.
        let result = identity.save();
        if result.is_err() {
            identity.restrictions = previous;
        }
        result
    }
    pub(crate) fn check_restrictions(
        &self,
        receipt: &RestrictionReceipt,
        epoch: u64,
    ) -> Result<(), String> {
        if self.policy_epoch.load(Ordering::SeqCst) != epoch
            || self
                .identity
                .lock()
                .map_err(|_| "Identity unavailable")?
                .restrictions
                .as_ref()
                != Some(receipt)
        {
            return Err("Local remote access consent changed".into());
        }
        Ok(())
    }
    /// The account's security state could not be confirmed. New nearby
    /// connections fall back to asking every time at once (fail closed), but
    /// a phone already connected is only dropped once the sync has kept failing
    /// for SYNC_GRACE: one slow or rate-limited poll every few minutes used to
    /// end every live connection, and a Trusted computer then needed approval
    /// to get the phone back. Revocations, resets and disables still end
    /// connections immediately through apply_restrictions.
    pub(crate) fn suspend_restrictions(&self) {
        let now = crate::remote_authorization::now();
        if !self.policy_pending.swap(true, Ordering::SeqCst) {
            self.policy_failing_since
                .store(now.max(1), Ordering::SeqCst);
            eprintln!(
                "Remote security sync failed; keeping live phones for {}s",
                SYNC_GRACE
            );
            return;
        }
        let since = self.policy_failing_since.load(Ordering::SeqCst);
        if since != 0 && since != u64::MAX && now.saturating_sub(since) >= SYNC_GRACE {
            self.policy_failing_since.store(u64::MAX, Ordering::SeqCst);
            eprintln!(
                "Remote security sync failing for {}s; ending live phone connections",
                SYNC_GRACE
            );
            self.invalidate_consent();
        }
    }
    fn invalidate_consent(&self) {
        self.lan_generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
        if let Ok(mut invitation) = self.invitation.lock() {
            *invitation = None;
        }
        self.end_connections();
    }
    pub(crate) fn apply_restriction_disable(
        &self,
        receipt: &RestrictionReceipt,
        epoch: u64,
    ) -> Result<(), String> {
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
        self.check_restrictions(receipt, epoch)?;
        self.invalidate_consent();
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        identity.lan_mode = LanMode::Disabled;
        identity.save()
    }
    pub(crate) fn apply_restrictions(
        &self,
        batch: RestrictionBatch,
        epoch: u64,
        acknowledge: bool,
    ) -> Result<Vec<String>, String> {
        if !batch.complete() {
            return Err("Incomplete remote security state".into());
        }
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
        self.check_restrictions(&batch.receipt, epoch)?;
        let page = batch
            .page
            .as_ref()
            .ok_or("Incomplete remote security state")?;
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        let removed: Vec<_> = identity
            .devices
            .keys()
            .filter(|key| {
                let approved = page
                    .approved_devices
                    .iter()
                    .find(|item| &item.public_key == *key)
                    .map_or(0, |item| item.revision);
                (page.reset_revision > batch.receipt.revision && approved <= page.reset_revision)
                    || batch
                        .removed
                        .iter()
                        .any(|item| &item.public_key == *key && item.revision > approved)
            })
            .cloned()
            .collect();
        for key in &removed {
            identity.devices.remove(key);
        }
        let disabled = page.disable_revision > batch.receipt.revision;
        if disabled {
            identity.lan_mode = LanMode::Disabled;
        }
        let mut receipt = batch.receipt.clone();
        if acknowledge {
            receipt.revision = page.revision;
        }
        identity.restrictions = Some(receipt);
        let result = if page.revision == batch.receipt.revision && acknowledge {
            Ok(())
        } else {
            identity.save()
        };
        if result.is_err() {
            identity.restrictions = Some(batch.receipt.clone());
        }
        drop(identity);
        if disabled || page.reset_revision > batch.receipt.revision || !removed.is_empty() {
            self.invalidate_consent();
        }
        if result.is_err() || !acknowledge {
            self.suspend_restrictions();
        }
        result?;
        self.policy_pending.store(!acknowledge, Ordering::SeqCst);
        if acknowledge {
            self.policy_failing_since.store(0, Ordering::SeqCst);
        }
        Ok(removed)
    }
}
