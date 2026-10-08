//! Notices a local website starting or stopping while a phone is connected, so the
//! phone can show its Live Preview at once instead of on its next poll. One shared
//! thread reads the listening ports every couple of seconds, and only while at
//! least one phone's event stream holds a [`Watch`]. The full, cwd-checked
//! discovery still runs only when the phone asks with `preview.list`.
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Once;
use std::time::Duration;

static REVISION: AtomicU64 = AtomicU64::new(0);
static WATCHERS: AtomicUsize = AtomicUsize::new(0);
static START: Once = Once::new();
const EVERY: Duration = Duration::from_secs(2);

/// Held by a phone's event stream; dropping it lets the thread go idle.
pub struct Watch(());

impl Drop for Watch {
    fn drop(&mut self) {
        WATCHERS.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn watch() -> Watch {
    WATCHERS.fetch_add(1, Ordering::SeqCst);
    START.call_once(|| {
        std::thread::spawn(|| {
            let mut last = None;
            loop {
                std::thread::sleep(EVERY);
                if WATCHERS.load(Ordering::SeqCst) == 0 {
                    last = None;
                    continue;
                }
                let now = listeners().map(|ports| (ports, super::native_discovery::signature()));
                if last.is_some() && now.is_some() && now != last {
                    REVISION.fetch_add(1, Ordering::SeqCst);
                }
                if now.is_some() {
                    last = now;
                }
            }
        });
    });
    Watch(())
}

/// Changes whenever the set of local listening sites does.
pub fn revision() -> u64 {
    REVISION.load(Ordering::SeqCst)
}

pub(super) fn changed() {
    REVISION.fetch_add(1, Ordering::SeqCst);
}

fn listeners() -> Option<Vec<(u32, u16)>> {
    let mut ports = super::discovery_system::listeners(Duration::from_millis(500))?
        .into_iter()
        .map(|listener| (listener.pid, listener.port))
        .collect::<Vec<_>>();
    ports.sort_unstable();
    ports.dedup();
    Some(ports)
}
