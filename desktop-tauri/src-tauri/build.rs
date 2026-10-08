mod build_commands;
mod build_notifications;
mod build_window_preview;
fn main() {
    build_window_preview::build();
    build_notifications::build();
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(build_commands::manifest()))
        .expect("Build native command permissions")
}
