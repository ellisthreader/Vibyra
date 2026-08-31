//! The window the user sees first, and the handover to the one they asked for.
//!
//! `main` is created hidden. This module owns the only three ways it is ever
//! revealed — the workspace reporting itself ready, the user closing the
//! splash, or a watchdog deciding nobody is going to. Every path ends in
//! [`hand_over`], and [`hand_over`] cannot fail: an update that will not
//! install is recoverable, a window that never opens is not.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const BOOT_LABEL: &str = "boot";
pub const MAIN_LABEL: &str = "main";

/// Phase names understood by `src/boot/bootState.ts`.
pub const LAUNCHING: &str = "launching";

const PHASE_EVENT: &str = "boot://phase";

/// A floor, not a delay. Startup work normally outruns it — the account
/// restore alone is a network round trip — and it exists only so a warm cache
/// and a local session cannot reduce the splash to a flicker.
const MIN_VISIBLE: Duration = Duration::from_millis(450);

/// Below this a status change is a half-finished crossfade rather than a
/// message; `boot.css` fades the line in over 180ms.
const MIN_STATUS: Duration = Duration::from_millis(180);

/// `main` is shown before `boot` closes, so the desktop never shows through
/// the seam. Long enough for the revealed window to paint its first frame,
/// short enough to read as one motion.
const OVERLAP: Duration = Duration::from_millis(120);

/// Nothing has reported ready. Generous, because the alternative to waiting
/// is stealing the splash from a slow but healthy start; bounded, because the
/// alternative to giving up is an app that never opens.
const WATCHDOG: Duration = Duration::from_secs(20);

static HANDED_OVER: AtomicBool = AtomicBool::new(false);
static SHOWN_AT: OnceLock<Instant> = OnceLock::new();

#[derive(Clone, Serialize)]
struct PhaseSignal<'a> {
    phase: &'a str,
}

/// Starts the watchdog behind the splash.
///
/// A build whose `boot` window failed to create would otherwise leave `main`
/// hidden forever, so the missing-window case hands over immediately rather
/// than waiting for the watchdog to notice.
pub fn arm(app: &AppHandle) {
    if app.get_webview_window(BOOT_LABEL).is_none() {
        hand_over(app);
        return;
    }
    let _ = SHOWN_AT.set(Instant::now());

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(WATCHDOG).await;
        hand_over(&app);
    });
}

/// Tells the splash what is happening. A no-op once it has closed.
pub fn phase(app: &AppHandle, phase: &str) {
    if let Some(window) = app.get_webview_window(BOOT_LABEL) {
        let _ = window.emit(PHASE_EVENT, PhaseSignal { phase });
    }
}

/// Reveals the workspace and retires the splash, no earlier than the floor.
pub fn hand_over(app: &AppHandle) {
    reveal(app, MIN_VISIBLE);
}

/// The same, without the floor — for a user who closed the splash themselves.
/// Making them watch out the rest of a minimum they never asked for would be
/// the one case where the floor is worse than the flicker it prevents.
pub fn hand_over_now(app: &AppHandle) {
    reveal(app, Duration::ZERO);
}

/// Idempotent by latch rather than by checking window state: this re-enters
/// through the boot window's own `CloseRequested` when we close it, and the
/// watchdog can fire while a legitimate handover is sleeping out its overlap.
fn reveal(app: &AppHandle, floor: Duration) {
    if HANDED_OVER.swap(true, Ordering::SeqCst) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let remaining = SHOWN_AT
            .get()
            .map(|shown| floor.saturating_sub(shown.elapsed()))
            .unwrap_or_default();

        // Only worth saying when there is time left to read it.
        if remaining >= MIN_STATUS {
            phase(&app, LAUNCHING);
        }
        if !remaining.is_zero() {
            tokio::time::sleep(remaining).await;
        }

        if let Some(main) = app.get_webview_window(MAIN_LABEL) {
            let _ = main.show();
            let _ = main.set_focus();
        }
        tokio::time::sleep(OVERLAP).await;
        if let Some(boot) = app.get_webview_window(BOOT_LABEL) {
            let _ = boot.close();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_splash_floor_leaves_room_to_read_the_launching_line() {
        // If the minimum visible time were shorter than one crossfade, the
        // `launching` branch in `hand_over` could never be taken and the
        // constant would be quietly dead.
        assert!(MIN_VISIBLE > MIN_STATUS);
    }

    #[test]
    fn the_watchdog_outlasts_a_slow_start_by_a_wide_margin() {
        assert!(WATCHDOG > MIN_VISIBLE * 10);
    }
}
