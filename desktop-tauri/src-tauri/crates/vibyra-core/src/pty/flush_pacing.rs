use std::time::Duration;

/// How the flusher paces deliveries to the renderer. See `Visibility` for the
/// tiers and `flusher::flush_due` for how the intervals are applied.
#[derive(Debug, Clone, PartialEq)]
pub struct FlushConfig {
    /// Least gap between deliveries to the focused pane under sustained
    /// output. Never a floor on echo: an isolated keystroke goes out on wake.
    pub tick: Duration,
    /// Period of the on-screen, unfocused tier.
    pub background_interval: Duration,
    /// Period of the off-screen tier.
    pub hidden_interval: Duration,
    /// How long one unpainted delivery may hold a session's next one back.
    ///
    /// Once a session's renderer has reported a paint (`PtyManager::painted`)
    /// the flusher hands it one chunk per painted frame, so a machine that
    /// paints slowly is asked to paint less often instead of being handed a
    /// backlog it cannot draw — the freeze where clicks queue behind repaints.
    /// A renderer that never reports is assumed to paint instantly, which is
    /// what an older frontend and every test sink are. This bounds the stall a
    /// lost or throttled report can cause: a hidden window, whose frames stop,
    /// still receives each pane's output at this rate.
    pub paint_timeout: Duration,
    pub pending_cap: usize,
    pub scrollback_cap: usize,
}

impl Default for FlushConfig {
    fn default() -> Self {
        Self {
            // Both pace *sustained* output only — the flusher delivers on
            // wake, so an isolated keystroke never waits. See `Visibility`.
            tick: Duration::from_millis(16),
            background_interval: Duration::from_millis(75),
            hidden_interval: Duration::from_millis(250),
            paint_timeout: Duration::from_millis(500),
            pending_cap: 1024 * 1024,
            scrollback_cap: 4 * 1024 * 1024,
        }
    }
}

/// How often an on-screen but unfocused pane may be delivered when the webview
/// composites in shared memory.
///
/// Measured 2026-08-31 on an NVIDIA/X11 session, where `Auto` resolves to the
/// shared-memory path and xterm therefore falls back to its DOM renderer. At
/// the app's real window size (1854x1048) one repaint at ~12 fps costs ~35% of
/// a core: ~17 points to composite the surface on the CPU and ~18 to the DOM
/// renderer. The default 75 ms asks each background pane for ~13 repaints a
/// second, so a handful of streaming agents saturates the single WebKit main
/// thread — the same thread that dispatches clicks, which is why the window
/// stops responding rather than merely looking slow.
///
/// 250 ms is ~4 a second. For text that is only being watched scroll past that
/// reads the same, and it deliberately matches `hidden_interval` so both paced
/// tiers land on the same epoch boundary and settle in one composite rather
/// than two (see `flusher::flush_due`).
const SOFTWARE_BACKGROUND_INTERVAL: Duration = Duration::from_millis(250);

/// Flush pacing for the compositing path this launch actually got.
///
/// Only the *paced* tier moves. `tick` — the focused pane — is deliberately
/// left alone: it is the one delivery whose latency a person can feel as they
/// type, and slowing it trades a stall nobody asked for against a stall they
/// did. Slowing a tier can never change what the terminal shows, only when:
/// `SessionOutput::drain` hands over everything buffered since the last
/// delivery in a single chunk.
pub fn flush_config(software_compositing: bool) -> FlushConfig {
    let base = FlushConfig::default();
    if !software_compositing {
        return base;
    }
    FlushConfig {
        background_interval: SOFTWARE_BACKGROUND_INTERVAL,
        ..base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_accelerated_path_keeps_the_default_pacing() {
        let config = flush_config(false);
        assert_eq!(config, FlushConfig::default());
    }

    #[test]
    fn software_compositing_paces_background_panes_further_apart() {
        let base = FlushConfig::default();
        let software = flush_config(true);
        assert!(
            software.background_interval > base.background_interval,
            "software compositing must ask background panes to repaint less often",
        );
    }

    #[test]
    fn the_focused_pane_is_never_slowed_to_pay_for_compositing() {
        // The regression this guards: "make it cheaper" applied to `tick` shows
        // up as typing that lags behind the keyboard, which is worse than the
        // congestion it relieves.
        let base = FlushConfig::default();
        assert_eq!(flush_config(true).tick, base.tick);
    }

    #[test]
    fn paced_tiers_share_a_boundary_so_they_settle_together() {
        let software = flush_config(true);
        assert_eq!(
            software.background_interval, software.hidden_interval,
            "aligned intervals let both paced tiers land in one scan",
        );
    }
}
