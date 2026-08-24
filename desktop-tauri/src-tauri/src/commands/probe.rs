//! Reporting channel for the keystroke-latency probe.
//!
//! The probe (`src/probe/` in the frontend) measures keystroke-to-paint
//! latency inside the real renderer. Its numbers have to leave the webview
//! somehow; stderr is the one place a headless test harness can always read.
//! Refused unless the probe environment variable is set, so a production
//! window cannot use it to write to the console.

use vibyra_core::CoreError;

#[tauri::command]
pub fn probe_report(line: String) -> Result<(), CoreError> {
    if std::env::var_os("VIBYRA_LATENCY_PROBE").is_none() {
        return Err(CoreError::InvalidPath("probe mode is not enabled".into()));
    }
    eprintln!("[probe] {line}");
    Ok(())
}

/// Which phases the probe should run and how many keys per phase, from the
/// harness environment. The webview cannot read environment variables, so
/// the harness passes its run plan through here.
#[tauri::command]
pub fn probe_config() -> Result<(String, u32), CoreError> {
    if std::env::var_os("VIBYRA_LATENCY_PROBE").is_none() {
        return Err(CoreError::InvalidPath("probe mode is not enabled".into()));
    }
    let phases =
        std::env::var("VIBYRA_PROBE_PHASES").unwrap_or_else(|_| "all-visible,focus-paced".into());
    let keys = std::env::var("VIBYRA_PROBE_KEYS")
        .ok()
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(40);
    Ok((phases, keys))
}
