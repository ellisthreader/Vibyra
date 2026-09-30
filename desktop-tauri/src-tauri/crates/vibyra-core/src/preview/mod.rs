mod bounded_text;
mod builtin;
mod companion;
mod desktop_command;
mod desktop_detect;
mod desktop_run;
mod desktop_script;
mod detect;
mod launch_plan;
mod launcher;
mod manager;
mod manager_support;
mod package;
mod package_profile;
mod process;
mod process_kill;
mod process_output;
mod process_spawn;
mod refresher;
mod service;
mod static_assets;
mod static_connection;
mod static_server;
mod target;
mod types;

pub use desktop_command::parse_desktop_command;
pub use detect::{desktop_target_for, inspect_project, inspect_project_with};
pub use manager::PreviewManager;
pub use refresher::{DesktopProbe, PreviewEvent, PreviewListener, ProbeSnapshot, TreeProcess};
pub use types::{
    DesktopCommand, DesktopStage, PreviewDeviceHint, PreviewInspection, PreviewPhase,
    PreviewStatus, PreviewTarget, PreviewTargetKind, PreviewWindow,
};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_desktop;
#[cfg(test)]
mod tests_desktop_run;
#[cfg(test)]
mod tests_detection;
#[cfg(test)]
mod tests_static;
