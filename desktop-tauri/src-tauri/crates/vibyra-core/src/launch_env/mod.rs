//! The environment Vibyra and its children actually need.
//!
//! Two problems, both invisible when the app is started from a terminal and
//! both fatal when it is started from the desktop:
//!
//! * **PATH** — a GUI launch inherits the session manager's PATH, which is
//!   missing every directory the user's shell rc adds. `user_path` resolves
//!   the PATH the user's own terminal has and installs it at startup.
//! * **AppImage capture** — the AppImage runtime points a dozen loader search
//!   paths inside its own mount so the bundled GTK/WebKit stack wins. Children
//!   must not inherit that. `appimage` plans the undo.

pub mod appimage;
#[cfg(unix)]
mod probe;
pub mod user_path;

pub use appimage::EnvFix;

/// Markers wrapping the probed PATH, shared by the prober and the parser.
const START: &str = "__VIBYRA_PATH_START__";
const END: &str = "__VIBYRA_PATH_END__";

/// Strips this process's AppImage environment capture from a child command, so
/// what it runs in is the user's environment rather than the bundle's.
pub fn sanitize_command(command: &mut std::process::Command) {
    let fix = appimage::current();
    for key in &fix.remove {
        command.env_remove(key);
    }
    for (key, value) in &fix.set {
        command.env(key, value);
    }
}
