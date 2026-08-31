use tauri::AppHandle;

use crate::boot_window;

/// The workspace reporting that it has rendered something worth showing.
///
/// Called once, from `signalAppReady` in `src/lib/bootHandoff.ts`, as soon as
/// the account gate has decided what to draw — a sign-in card or the
/// workspace. Anything earlier would reveal a window mid-decision; anything
/// later (waiting on terminals to respawn, say) would hold the splash over an
/// app that is already usable.
#[tauri::command]
pub fn boot_main_ready(app: AppHandle) {
    boot_window::hand_over(&app);
}
