use serde::Serialize;

use crate::renderer::{self, RendererMode};

/// What the running webview actually got, plus the inputs behind that choice.
/// The Settings pane renders this so a user hitting black panes or high CPU
/// can see which path they are on without reading logs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererPolicy {
    /// Saved preference: "auto", "accelerated", or "compatibility".
    pub mode: String,
    /// True when the webview composites through WebKit's shared-memory path.
    pub software_compositing: bool,
    /// True when detection believes the session renders through NVIDIA.
    pub nvidia_session: bool,
    /// False off Linux, where there is no DMA-BUF renderer to choose.
    pub configurable: bool,
    /// The app-specific environment override forced the outcome, so the saved
    /// mode is ignored until the user unsets `VIBYRA_WEBKIT_DMABUF`.
    pub environment_override: bool,
    /// This launch rewrote a promoted NVIDIA `accelerated` mode back to
    /// `auto` (see `renderer_heal.rs`); the frontend announces it once.
    pub healed_this_launch: bool,
}

/// True when the WebView composites through WebKit's shared-memory path
/// (the DMA-BUF renderer is disabled). WebGL canvases do not composite
/// reliably in that mode — xterm's WebGL addon "loads" but the terminal
/// stays black — so the frontend uses this to prefer the DOM renderer.
///
/// The env var is set by `renderer::configure` before the webview is created
/// (or inherited from the user's environment), so reading it here reflects
/// the mode the running webview actually uses. Reported to the frontend as
/// part of [`renderer_policy`] rather than as a command of its own.
fn software_compositing() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[tauri::command]
pub fn renderer_policy() -> RendererPolicy {
    let mode = if cfg!(target_os = "linux") {
        renderer::saved_mode()
    } else {
        RendererMode::Auto
    };
    RendererPolicy {
        mode: mode.as_str().to_string(),
        software_compositing: software_compositing(),
        nvidia_session: renderer::nvidia_session(),
        configurable: cfg!(target_os = "linux"),
        environment_override: renderer::environment_override(),
        healed_this_launch: renderer::healed_this_launch(),
    }
}
