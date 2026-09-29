//! The environment a desktop app is started in so its window can be shown on
//! the phone. Pure: the platform and environment are parameters, so every
//! build tests every platform's rule.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum HostOs {
    Mac,
    Windows,
    Linux,
    Other,
}

impl HostOs {
    pub(crate) fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::Mac
        } else if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "linux") {
            Self::Linux
        } else {
            Self::Other
        }
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct EnvPlan {
    pub set: Vec<(String, String)>,
    pub remove: Vec<String>,
}

/// Toolkit switches that put an app on X11. Vibyra captures X11 windows, and
/// on a Wayland desktop XWayland serves them, so no one has to pick the
/// window on the computer's screen.
const X11: [(&str, &str); 6] = [
    ("GDK_BACKEND", "x11"),
    ("WINIT_UNIX_BACKEND", "x11"),
    ("ELECTRON_OZONE_PLATFORM_HINT", "x11"),
    ("QT_QPA_PLATFORM", "xcb"),
    ("SDL_VIDEODRIVER", "x11"),
    // WebKitGTK (Tauri) can draw a blank window through DMA-BUF under XWayland.
    ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
];

pub(crate) fn desktop_env(
    os: HostOs,
    lookup: &dyn Fn(&str) -> Option<String>,
) -> Result<EnvPlan, String> {
    let mut plan = EnvPlan {
        set: vec![("CARGO_TERM_COLOR".into(), "never".into())],
        remove: Vec::new(),
    };
    if os != HostOs::Linux {
        return Ok(plan);
    }
    if lookup("DISPLAY").is_none_or(|display| display.trim().is_empty()) {
        return Err(
            "Live Preview shows Linux apps through X11, and this session has no X11 \
                    display. Turn on XWayland or sign in to an X11 session, then run it again."
                .into(),
        );
    }
    plan.set.extend(
        X11.iter()
            .map(|(key, value)| ((*key).into(), (*value).into())),
    );
    // Newer Chromium and winit ignore the hints while a Wayland socket is
    // offered; without one they fall back to X11. Only this app loses it.
    if lookup("WAYLAND_DISPLAY").is_some() {
        plan.remove.push("WAYLAND_DISPLAY".into());
    }
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |key| {
            pairs
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| (*value).to_owned())
        }
    }

    #[test]
    fn mac_and_windows_only_quiet_the_build_colours() {
        for os in [HostOs::Mac, HostOs::Windows] {
            let plan = desktop_env(os, &env(&[("WAYLAND_DISPLAY", "wayland-0")])).unwrap();
            assert_eq!(plan.set, vec![("CARGO_TERM_COLOR".into(), "never".into())]);
            assert!(plan.remove.is_empty());
        }
    }

    #[test]
    fn linux_wayland_sessions_run_the_app_on_xwayland() {
        let plan = desktop_env(
            HostOs::Linux,
            &env(&[("DISPLAY", ":0"), ("WAYLAND_DISPLAY", "wayland-0")]),
        )
        .unwrap();
        assert!(plan.set.contains(&("GDK_BACKEND".into(), "x11".into())));
        assert!(plan
            .set
            .contains(&("ELECTRON_OZONE_PLATFORM_HINT".into(), "x11".into())));
        assert_eq!(plan.remove, vec!["WAYLAND_DISPLAY".to_owned()]);
    }

    #[test]
    fn linux_x11_sessions_keep_their_environment() {
        let plan = desktop_env(HostOs::Linux, &env(&[("DISPLAY", ":1")])).unwrap();
        assert!(plan.remove.is_empty());
    }

    #[test]
    fn linux_without_any_x11_display_says_so_instead_of_starting_blind() {
        let error = desktop_env(HostOs::Linux, &env(&[("WAYLAND_DISPLAY", "wayland-0")]));
        assert!(error.unwrap_err().contains("XWayland"));
    }
}
