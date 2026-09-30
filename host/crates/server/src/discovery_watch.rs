use crate::discovery::Advertisement;
use std::{
    future::Future,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Default)]
pub struct Status {
    pub advertised: bool,
    pub error: Option<String>,
}

/// A listener can work while Bonjour registration fails. Keep direct pairing
/// available and retry advertising instead of silently losing discovery until
/// the person toggles sharing off and on. A registration that succeeded is not
/// left alone either: it is made again whenever it stops being trustworthy
/// (`Advertisement::stale`), because a daemon that has gone deaf looks exactly
/// like a computer that was never shared.
pub async fn maintain(name: String, id: String, address: SocketAddr, status: Arc<Mutex<Status>>) {
    if address.ip().is_loopback() {
        std::future::pending::<()>().await;
        return;
    }
    maintain_with(
        || Advertisement::start(&name, &id, address),
        |advertisement: &Advertisement| advertisement.stale(),
        status,
        Duration::from_secs(6),
    )
    .await;
}

async fn maintain_with<T: Send + 'static, F: Future<Output = ()>>(
    mut start: impl FnMut() -> Result<T, String>,
    stale: impl Fn(&T) -> F,
    status: Arc<Mutex<Status>>,
    delay: Duration,
) {
    loop {
        match start() {
            Ok(advertisement) => {
                if let Ok(mut value) = status.lock() {
                    value.advertised = true;
                    value.error = None;
                }
                stale(&advertisement).await;
                // Unregisters before the next registration is made, and on
                // shutdown this future is dropped here instead. Unregistering
                // waits up to a second for the daemon, which is done in the
                // blocking pool so the listener polled beside this keeps
                // accepting phones meanwhile.
                let _ = tokio::task::spawn_blocking(move || drop(advertisement)).await;
                if let Ok(mut value) = status.lock() {
                    value.advertised = false;
                }
            }
            Err(error) => {
                eprintln!("Nearby discovery unavailable; retrying in a moment: {error}");
                if let Ok(mut value) = status.lock() {
                    value.advertised = false;
                    value.error = Some(error);
                }
                tokio::time::sleep(delay).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    struct Registration(Arc<AtomicBool>);
    impl Drop for Registration {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn retries_registration_and_unregisters_on_shutdown() {
        let status = Arc::new(Mutex::new(Status::default()));
        let dropped = Arc::new(AtomicBool::new(false));
        let mut calls = 0;
        let retry = maintain_with(
            || {
                calls += 1;
                if calls == 1 {
                    Err("Network unavailable".into())
                } else {
                    Ok(Registration(dropped.clone()))
                }
            },
            |_: &Registration| std::future::pending::<()>(),
            status.clone(),
            Duration::from_millis(10),
        );
        let mut retry = Box::pin(retry);
        tokio::select! {
            _ = &mut retry => panic!("watch must remain alive"),
            _ = tokio::time::sleep(Duration::from_millis(1)) => {},
        }
        assert!(!status.lock().unwrap().advertised);
        assert!(status.lock().unwrap().error.is_some());
        tokio::select! {
            _ = &mut retry => panic!("watch must remain alive"),
            _ = async {
                while !status.lock().unwrap().advertised {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
            } => {},
            _ = tokio::time::sleep(Duration::from_secs(1)) => panic!("registration did not recover"),
        }
        assert!(status.lock().unwrap().error.is_none());
        drop(retry);
        assert!(dropped.load(Ordering::SeqCst));
    }

    /// A daemon that has gone deaf still holds its sockets, so the watch cannot
    /// wait for an error: it advertises again the moment the registration stops
    /// being trustworthy, and unregisters the old one on the way.
    #[tokio::test]
    async fn a_registration_that_goes_stale_is_made_again() {
        let status = Arc::new(Mutex::new(Status::default()));
        let dropped = Arc::new(AtomicBool::new(false));
        let calls = Arc::new(AtomicUsize::new(0));
        let once = Arc::new(AtomicBool::new(true));
        let watch = maintain_with(
            {
                let calls = calls.clone();
                let dropped = dropped.clone();
                move || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok::<_, String>(Registration(dropped.clone()))
                }
            },
            move |_: &Registration| {
                let once = once.clone();
                async move {
                    // Stale once, then trustworthy, so the watch settles again
                    // rather than spinning.
                    if once.swap(false, Ordering::SeqCst) {
                        return;
                    }
                    std::future::pending::<()>().await
                }
            },
            status.clone(),
            Duration::from_millis(10),
        );
        let mut watch = Box::pin(watch);
        tokio::select! {
            _ = &mut watch => panic!("watch must remain alive"),
            _ = async {
                while calls.load(Ordering::SeqCst) < 2 {
                    tokio::time::sleep(Duration::from_millis(2)).await;
                }
            } => {},
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                panic!("a stale registration was never made again")
            },
        }
        assert!(
            dropped.load(Ordering::SeqCst),
            "the stale registration is unregistered before the next one"
        );
        assert!(status.lock().unwrap().advertised);
    }
}
