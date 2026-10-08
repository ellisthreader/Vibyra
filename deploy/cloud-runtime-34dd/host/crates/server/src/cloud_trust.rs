//! Headless trust for a cloud computer. Nobody sits at it to press Approve, so
//! a phone is admitted without a local prompt only when ALL of these hold:
//! account mode switched this on after the account API's register reply said
//! the computer is trusted, the connection carries a backend-signed grant
//! (verified against the pinned key and bound to this Host, this account and
//! this exact device), and that grant permits terminal access. Anything else
//! takes the normal path, which nobody can answer, so it fails closed.
#![allow(dead_code)]
use crate::{remote_authorization::Access, state::Shared};
use std::sync::atomic::{AtomicBool, Ordering};

static TRUSTED: AtomicBool = AtomicBool::new(false);

pub(crate) fn set(trusted: bool) {
    TRUSTED.store(trusted, Ordering::SeqCst);
}
pub(crate) fn enabled() -> bool {
    TRUSTED.load(Ordering::SeqCst)
}

pub(crate) fn admit(
    shared: &Shared,
    device: &str,
    hello: &[u8],
    access: &Access,
) -> Result<(), String> {
    let Some(grant) = access else {
        return Ok(());
    };
    if !enabled() || !grant.permits("terminal:access") {
        return Ok(());
    }
    grant.valid()?;
    if shared.trusted(device) {
        return Ok(());
    }
    let hello: crate::auth::Hello =
        serde_json::from_slice(hello).map_err(|_| "Invalid authentication payload")?;
    shared.trust_with_generation(device, &hello.device_name, None)
}
