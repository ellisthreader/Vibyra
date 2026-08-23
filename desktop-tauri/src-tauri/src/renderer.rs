//! WebKit compositing policy.
//!
//! WebKitGTK's DMA-BUF renderer has a long history of freezing and blanking
//! windows on the NVIDIA driver, so on those sessions the app falls back to
//! the shared-memory renderer. That fallback software-composites every frame,
//! which makes streaming terminals far more CPU-hungry, so it must stay
//! narrow: only sessions that actually render through NVIDIA pay for it.
//!
//! The decision is made here, before the webview exists, and published to the
//! frontend through `commands::render` — under the shared-memory path WebGL
//! canvases load but never paint, so xterm has to use its DOM renderer.

/// The user's explicit choice from Settings; `Auto` runs the detection below.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RendererMode {
    #[default]
    Auto,
    /// Keep WebKit's accelerated renderer even where detection would not.
    Accelerated,
    /// Always take the shared-memory renderer and xterm's DOM renderer.
    Compatibility,
}

impl RendererMode {
    /// Unknown values fall back to `Auto` rather than failing to parse, so a
    /// hand-edited or downgraded settings.json can never brick startup.
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "accelerated" => Self::Accelerated,
            "compatibility" => Self::Compatibility,
            _ => Self::Auto,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Accelerated => "accelerated",
            Self::Compatibility => "compatibility",
        }
    }
}

#[cfg(target_os = "linux")]
/// What the running system reports about its graphics stack.
#[derive(Debug, Default, Clone)]
pub struct GpuFacts {
    /// An NVIDIA kernel module is loaded (proprietary or `nvidia-open`).
    pub nvidia_module: bool,
    /// PCI vendor id of the `boot_vga` GPU — the one the display server brings
    /// the session up on. `None` when the topology cannot be read.
    pub primary_vendor: Option<String>,
    /// The session explicitly asks for NVIDIA PRIME render offload.
    pub nvidia_offload: bool,
}

#[cfg(target_os = "linux")]
const NVIDIA_PCI_VENDOR: &str = "0x10de";

/// Set when `VIBYRA_WEBKIT_DMABUF` decided the path, so the Settings pane can
/// say the saved mode is inert.
#[cfg(target_os = "linux")]
static ENV_FORCED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "linux")]
fn mark_environment_override() {
    ENV_FORCED.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// True when the session renders (or may render) through NVIDIA.
///
/// A hybrid laptop loads the NVIDIA module while the compositor runs on the
/// integrated GPU; WebKit composites there, so the accelerated path is both
/// safe and much cheaper. Anything undetermined stays conservative: a wrongly
/// accelerated NVIDIA session freezes windows, while a wrongly conservative
/// one only costs CPU.
#[cfg(target_os = "linux")]
pub fn nvidia_drives_session(facts: &GpuFacts) -> bool {
    if !facts.nvidia_module {
        return false;
    }
    if facts.nvidia_offload {
        return true;
    }
    match facts.primary_vendor.as_deref() {
        Some(vendor) => vendor == NVIDIA_PCI_VENDOR,
        None => true,
    }
}

/// Resolves the policy from the user's mode and the probed facts.
/// `true` means "disable the DMA-BUF renderer".
#[cfg(target_os = "linux")]
pub fn use_shared_memory(mode: RendererMode, facts: &GpuFacts) -> bool {
    match mode {
        RendererMode::Accelerated => false,
        RendererMode::Compatibility => true,
        RendererMode::Auto => nvidia_drives_session(facts),
    }
}

#[cfg(target_os = "linux")]
#[path = "renderer_probe.rs"]
mod probe;

/// Reads the saved renderer mode without loading the whole app state — this
/// runs before the Tauri builder, so `AppState` does not exist yet.
pub fn saved_mode() -> RendererMode {
    RendererMode::parse(
        &vibyra_core::settings::Settings::load_from(
            &vibyra_core::settings::Settings::default_path(),
        )
        .renderer_mode,
    )
}

/// True when the environment, not the saved Settings mode, decided the
/// compositing path — the Settings pane says so rather than promising that a
/// restart will apply a mode the environment will keep overriding.
pub fn environment_override() -> bool {
    #[cfg(target_os = "linux")]
    {
        ENV_FORCED.load(std::sync::atomic::Ordering::Relaxed)
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Whether detection believes this session renders through NVIDIA, which is
/// what `Auto` acts on. Always false off Linux.
pub fn nvidia_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        nvidia_drives_session(&probe::facts())
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Applies the compositing policy. A no-op off Linux: WebView2 and WKWebView
/// have no DMA-BUF renderer and composite WebGL correctly.
pub fn configure() {
    #[cfg(target_os = "linux")]
    probe::configure(saved_mode());
}

#[cfg(test)]
#[path = "renderer_tests.rs"]
mod tests;
