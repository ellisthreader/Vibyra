//! One-shot startup repair for the 0.2.x promotion incident.
//!
//! Before 0.2.5 the performance watchdog offered "Allow GPU next launch" on
//! NVIDIA sessions, where the accelerated path is measurably slower and made
//! typing run one character behind. Installs that took that offer are stuck:
//! nothing on the accelerated path ever offers the way back. This runs before
//! the webview exists and rewrites exactly that state — `accelerated` saved on
//! an NVIDIA-driven session, heal marker unset — back to `auto`.
//!
//! The marker is set on the first pass regardless, so a user who *chooses*
//! "accelerated" on 0.2.5 or later is never fought.

use std::path::Path;

use vibyra_core::settings::Settings;

use super::RendererMode;

/// Applies the repair. Returns true only when this launch actually rewrote an
/// NVIDIA-forced `accelerated` back to `auto` — the frontend announces that
/// once. A failed save leaves the file untouched and reports false; the next
/// launch simply tries again.
pub(super) fn apply(path: &Path, nvidia_session: bool) -> bool {
    let mut settings = Settings::load_from(path);
    if settings.renderer_accel_heal_done {
        return false;
    }
    let heal =
        nvidia_session && RendererMode::parse(&settings.renderer_mode) == RendererMode::Accelerated;
    settings.renderer_accel_heal_done = true;
    if heal {
        settings.renderer_mode = RendererMode::Auto.as_str().to_string();
    }
    if settings.save_to(path).is_err() {
        return false;
    }
    heal
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("vibyra-heal-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir.join("settings.json")
    }

    fn write(path: &Path, body: &str) {
        std::fs::write(path, body).expect("seed settings");
    }

    #[test]
    fn rewrites_a_promoted_accelerated_nvidia_install_back_to_auto() {
        let path = scratch("promoted");
        write(&path, r#"{"rendererMode":"accelerated","theme":"light"}"#);
        assert!(apply(&path, true));
        let after = Settings::load_from(&path);
        assert_eq!(after.renderer_mode, "auto");
        assert!(after.renderer_accel_heal_done);
        // Untouched fields survive the rewrite.
        assert_eq!(after.theme, "light");
    }

    #[test]
    fn runs_exactly_once_so_a_later_explicit_choice_stands() {
        let path = scratch("explicit");
        write(&path, r#"{"rendererMode":"accelerated"}"#);
        assert!(apply(&path, true));
        // The user picks accelerated again, deliberately, on a healed install.
        let mut settings = Settings::load_from(&path);
        settings.renderer_mode = "accelerated".to_string();
        settings.save_to(&path).unwrap();
        assert!(!apply(&path, true));
        assert_eq!(Settings::load_from(&path).renderer_mode, "accelerated");
    }

    #[test]
    fn non_nvidia_sessions_and_other_modes_only_gain_the_marker() {
        let accel_intel = scratch("intel");
        write(&accel_intel, r#"{"rendererMode":"accelerated"}"#);
        assert!(!apply(&accel_intel, false));
        let after = Settings::load_from(&accel_intel);
        assert_eq!(after.renderer_mode, "accelerated");
        assert!(after.renderer_accel_heal_done);

        let auto_nvidia = scratch("auto");
        write(&auto_nvidia, r#"{"rendererMode":"auto"}"#);
        assert!(!apply(&auto_nvidia, true));
        let after = Settings::load_from(&auto_nvidia);
        assert_eq!(after.renderer_mode, "auto");
        assert!(after.renderer_accel_heal_done);
    }

    #[test]
    fn a_missing_settings_file_boots_healed_without_a_rewrite_claim() {
        let path = scratch("fresh");
        assert!(!apply(&path, true));
        assert!(Settings::load_from(&path).renderer_accel_heal_done);
    }
}
