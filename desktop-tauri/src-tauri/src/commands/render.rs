use serde::Serialize;

use crate::compositing::software_compositing;
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
