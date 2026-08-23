//! Linux graphics probing for [`super`]: which GPU brings up the session,
//! whether NVIDIA offload is requested, and applying the resulting
//! `WEBKIT_DISABLE_DMABUF_RENDERER` decision before the webview is created.

use super::{GpuFacts, RendererMode};
use std::path::Path;

const DRM_ROOT: &str = "/sys/class/drm";
const WEBKIT_DISABLE_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

fn override_disable(raw: Option<&str>) -> Option<bool> {
    match raw {
        Some("1") => Some(false),
        Some("0") => Some(true),
        _ => None,
    }
}

fn nvidia_module_loaded() -> bool {
    Path::new("/sys/module/nvidia").exists()
}

/// Reads the `boot_vga` GPU's vendor id. Unreadable entries are skipped
/// rather than aborting the scan — a card without a PCI `device` link is
/// normal (render nodes, virtual outputs).
pub(super) fn primary_gpu_vendor(drm_root: &Path) -> Option<String> {
    for entry in std::fs::read_dir(drm_root).ok()?.flatten() {
        let device = entry.path().join("device");
        if std::fs::read_to_string(device.join("boot_vga"))
            .unwrap_or_default()
            .trim()
            != "1"
        {
            continue;
        }
        let vendor = std::fs::read_to_string(device.join("vendor")).unwrap_or_default();
        let vendor = vendor.trim().to_ascii_lowercase();
        if !vendor.is_empty() {
            return Some(vendor);
        }
    }
    None
}

fn offload_requested() -> bool {
    let flagged = |key: &str| {
        std::env::var(key)
            .map(|value| !value.trim().is_empty() && value.trim() != "0")
            .unwrap_or(false)
    };
    flagged("__NV_PRIME_RENDER_OFFLOAD")
        || std::env::var("__GLX_VENDOR_LIBRARY_NAME")
            .map(|value| value.eq_ignore_ascii_case("nvidia"))
            .unwrap_or(false)
}

pub(super) fn facts() -> GpuFacts {
    GpuFacts {
        nvidia_module: nvidia_module_loaded(),
        primary_vendor: primary_gpu_vendor(Path::new(DRM_ROOT)),
        nvidia_offload: offload_requested(),
    }
}

/// Applies the policy by setting `WEBKIT_DISABLE_DMABUF_RENDERER` before the
/// webview is created. That WebKit variable is output-only: relaunches inherit
/// it from Vibyra, so accepting it as input pins the previous mode forever.
/// The app-specific `VIBYRA_WEBKIT_DMABUF=1|0` remains the explicit override.
pub(super) fn configure(mode: RendererMode) {
    std::env::remove_var(WEBKIT_DISABLE_DMABUF);
    let explicit = std::env::var("VIBYRA_WEBKIT_DMABUF").ok();
    let disable = match override_disable(explicit.as_deref()) {
        Some(disable) => {
            super::mark_environment_override();
            disable
        }
        None => super::use_shared_memory(mode, &facts()),
    };
    if disable {
        // SAFETY: single-threaded startup, before the webview is created.
        std::env::set_var(WEBKIT_DISABLE_DMABUF, "1");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn restore(key: &str, value: Option<OsString>) {
        match value {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    fn accepts_only_the_app_specific_boolean_override() {
        assert_eq!(override_disable(Some("1")), Some(false));
        assert_eq!(override_disable(Some("0")), Some(true));
        assert_eq!(override_disable(Some("yes")), None);
        assert_eq!(override_disable(None), None);
    }

    #[test]
    fn accelerated_mode_clears_an_inherited_webkit_disable_flag() {
        let previous_webkit = std::env::var_os(WEBKIT_DISABLE_DMABUF);
        let previous_override = std::env::var_os("VIBYRA_WEBKIT_DMABUF");
        std::env::set_var(WEBKIT_DISABLE_DMABUF, "1");
        std::env::remove_var("VIBYRA_WEBKIT_DMABUF");

        configure(RendererMode::Accelerated);

        assert!(std::env::var_os(WEBKIT_DISABLE_DMABUF).is_none());
        restore(WEBKIT_DISABLE_DMABUF, previous_webkit);
        restore("VIBYRA_WEBKIT_DMABUF", previous_override);
    }
}
