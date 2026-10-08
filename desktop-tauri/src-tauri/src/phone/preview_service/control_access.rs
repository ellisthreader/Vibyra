//! Remote control retains the account and live RPC boundary until native effects.
use super::PreviewService;
use std::{cell::RefCell, sync::Arc};
use vibyra_core::preview::with_launch_authorization;

type Check = Arc<dyn Fn() -> Result<(), String> + Send + Sync>;
thread_local! { static CURRENT: RefCell<Option<Check>> = RefCell::new(None); }
pub(super) fn check() -> Result<(), String> {
    let check = CURRENT.with(|current| current.borrow().clone());
    check.map_or(Ok(()), |check| check())
}
pub(super) fn permission(permission: &str) -> Result<(), String> {
    check()?;
    if vibyra_host::current_rpc_access().is_some_and(|access| !access.permits(permission)) {
        return Err("This remote session does not permit that Preview action".into());
    }
    Ok(())
}
impl PreviewService {
    pub(super) fn remote_control<T>(
        &self,
        permissions: &[&'static str],
        run: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let access = vibyra_host::current_rpc_access()
            .ok_or("Preview requires an authenticated connection")?;
        let account = self.inner.grants.active_account()?;
        let grants = self.inner.grants.clone();
        let permissions = permissions.to_vec();
        let typing = self.inner.typing.lock().clone();
        let check: Check = Arc::new(move || {
            if !permissions
                .iter()
                .all(|permission| access.permits(permission))
                || grants.active_account().as_deref() != Ok(account.as_str())
                || (permissions.contains(&"terminal:access")
                    && typing
                        .as_ref()
                        .is_some_and(|typing| !typing.load(std::sync::atomic::Ordering::SeqCst)))
            {
                return Err("This Preview request is no longer authorized".into());
            }
            Ok(())
        });
        check()?;
        struct Restore(Option<Check>);
        impl Drop for Restore {
            fn drop(&mut self) {
                CURRENT.with(|current| *current.borrow_mut() = self.0.take());
            }
        }
        let _restore = Restore(CURRENT.with(|current| current.replace(Some(check.clone()))));
        let process_access = vibyra_host::current_rpc_access().unwrap();
        let process_typing = self.inner.typing.lock().clone();
        with_launch_authorization(
            Arc::new(move |process| {
                check().map_err(vibyra_core::CoreError::Preview)?;
                if process
                    && (!process_access.permits("terminal:access")
                        || process_typing.as_ref().is_some_and(|typing| {
                            !typing.load(std::sync::atomic::Ordering::SeqCst)
                        }))
                {
                    return Err(vibyra_core::CoreError::Preview(
                        "This remote session cannot start processes".into(),
                    ));
                }
                Ok(())
            }),
            run,
        )
    }
}
