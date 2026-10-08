//! Writes the cloud sync block of the settings. The same discipline as `save_settings`:
//! one writer at a time, memory changes only after the file was written, and the other
//! settings are carried over untouched.

use vibyra_core::cloud_sync_settings::CloudSyncSettings;

use crate::state::AppState;

/// UI mutations also bind the verified account generation captured at admission.
pub fn update_for_authority(
    state: &AppState,
    token: &str,
    epoch: u64,
    change: impl FnOnce(&mut CloudSyncSettings),
) -> Result<(), String> {
    let _write = state.settings_write.lock();
    state
        .account
        .with_authority(token, epoch, || save(state, change))?
}

fn save(state: &AppState, change: impl FnOnce(&mut CloudSyncSettings)) -> Result<(), String> {
    let mut next = state.settings.lock().clone();
    change(&mut next.cloud_sync);
    next.save_to(&state.settings_path)
        .map_err(|e| e.to_string())?;
    *state.settings.lock() = next;
    Ok(())
}
