mod authorization;
mod bounded_text;
mod builtin;
mod companion;
mod desktop_command;
mod desktop_detect;
mod desktop_run;
mod desktop_script;
mod detect;
mod diagnose;
mod install;
mod launch_plan;
mod launch_processes;
mod launcher;
mod manager;
mod manager_support;
mod package;
mod package_companion;
mod package_direct;
mod package_profile;
mod package_runtime;
mod process;
mod process_kill;
mod process_output;
mod process_spawn;
mod refresher;
mod service;
mod service_install;
mod stacks;
mod stacks_other;
mod static_assets;
mod static_connection;
mod static_server;
mod target;
mod types;
mod types_extra;
mod workspace;

pub use authorization::{check_privileged_effect, with_launch_authorization};
pub use desktop_command::parse_desktop_command;
pub use detect::{desktop_target_for, inspect_project, inspect_project_with};
pub use manager::{PreviewAdmission, PreviewManager};
pub use refresher::{DesktopProbe, PreviewEvent, PreviewListener, ProbeSnapshot, TreeProcess};
pub use types::{
    DesktopCommand, DesktopStage, PreviewDeviceHint, PreviewErrorCode, PreviewInspection,
    PreviewPhase, PreviewStatus, PreviewStep, PreviewTarget, PreviewTargetKind, PreviewWindow,
    ProjectKind, TargetInfo,
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
mod tests_reliability;
#[cfg(all(test, unix))]
mod tests_runtime;
#[cfg(test)]
mod tests_stacks;
#[cfg(test)]
mod tests_static;
