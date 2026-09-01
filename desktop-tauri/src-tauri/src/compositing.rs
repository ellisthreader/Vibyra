//! Which compositing path the running webview actually got.
//!
//! Two unrelated decisions read this, so it lives in one place rather than
//! being re-derived from the environment at each call site: the renderer
//! policy the Settings pane shows, and the PTY flush pacing (shared-memory
//! compositing pays for every repaint on the CPU, so background panes are
//! asked to repaint less often — see `vibyra_core::pty::flush_config`).

/// True when the webview composites through WebKit's shared-memory path — the
/// DMA-BUF renderer is disabled.
///
/// `renderer::configure` sets the variable before the webview is created (or
/// inherits it from the user's environment), and both readers run after that,
/// so this reports the path the running webview is really on rather than the
/// path the saved setting asks for. WebGL canvases also fail to composite in
/// this mode, which is the other reason the frontend needs to know.
pub fn software_compositing() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}
