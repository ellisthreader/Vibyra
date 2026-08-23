mod bounded_text;
mod builtin;
mod detect;
mod launcher;
mod manager;
mod package;
mod package_command;
mod package_profile;
mod package_runtime;
mod package_script;
mod process;
mod process_output;
mod service;
mod static_assets;
mod static_connection;
mod static_server;
mod target;
mod types;

pub use detect::inspect_project;
pub use manager::PreviewManager;
pub use types::{PreviewDeviceHint, PreviewInspection, PreviewPhase, PreviewStatus, PreviewTarget};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_mobile;
#[cfg(test)]
mod tests_static;
