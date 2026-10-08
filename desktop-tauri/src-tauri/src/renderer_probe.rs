//! Linux graphics probing for [`super`]: which GPU brings up the session,
//! whether NVIDIA offload is requested, and applying the resulting
//! `WEBKIT_DISABLE_DMABUF_RENDERER` decision before the webview is created.

use super::{GpuFacts, RendererMode};
use std::path::Path;

const DRM_ROOT: &str = "/sys/class/drm";

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

/// Applies the policy by setting `WEBKIT_DISABLE_DMABUF_RENDERER` before
/// the webview is created. Precedence, highest first: the variable already
/// present in the user's environment, the `VIBYRA_WEBKIT_DMABUF=1|0`
/// escape hatch, the saved Settings mode, then detection.
pub(super) fn configure(mode: RendererMode) {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        super::mark_environment_override();
        return;
    }
    let disable = match std::env::var("VIBYRA_WEBKIT_DMABUF").ok().as_deref() {
        Some("1") => {
            super::mark_environment_override();
            false
        }
        Some("0") => {
            super::mark_environment_override();
            true
        }
        _ => super::use_shared_memory(mode, &facts()),
    };
    if disable {
        // SAFETY: single-threaded startup, before the webview is created.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
