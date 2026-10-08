//! Whether the computer is locked. Unknown (no logind, no screensaver
//! service, as in a bare X server) counts as unlocked.

use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
use dbus::blocking::Connection;
use parking_lot::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_millis(400);
const CACHE: Duration = Duration::from_secs(1);

pub(super) fn unlocked() -> Result<(), String> {
    static SEEN: OnceLock<Mutex<Option<(Instant, bool)>>> = OnceLock::new();
    let mut seen = SEEN.get_or_init(Default::default).lock();
    let locked = match *seen {
        Some((at, locked)) if at.elapsed() < CACHE => locked,
        _ => {
            let locked = logind_locked().or_else(screensaver_active).unwrap_or(false);
            *seen = Some((Instant::now(), locked));
            locked
        }
    };
    if locked {
        Err("Unlock your computer to preview its windows.".into())
    } else {
        Ok(())
    }
}

fn logind_locked() -> Option<bool> {
    let system = Connection::new_system().ok()?;
    let manager = system.with_proxy("org.freedesktop.login1", "/org/freedesktop/login1", TIMEOUT);
    let (session,): (dbus::Path<'static>,) = manager
        .method_call(
            "org.freedesktop.login1.Manager",
            "GetSessionByPID",
            (std::process::id(),),
        )
        .ok()?;
    let session = system.with_proxy("org.freedesktop.login1", session, TIMEOUT);
    session
        .get("org.freedesktop.login1.Session", "LockedHint")
        .ok()
}

fn screensaver_active() -> Option<bool> {
    let bus = Connection::new_session().ok()?;
    let saver = bus.with_proxy(
        "org.freedesktop.ScreenSaver",
        "/org/freedesktop/ScreenSaver",
        TIMEOUT,
    );
    let (active,): (bool,) = saver
        .method_call("org.freedesktop.ScreenSaver", "GetActive", ())
        .ok()?;
    Some(active)
}
