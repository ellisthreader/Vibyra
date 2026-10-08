mod account_api;
mod account_auth;
mod account_billing;
mod account_cancel;
mod account_delete;
mod account_device;
mod account_devices;
#[cfg(test)]
mod account_endpoint_tests;
mod account_endpoints;
mod account_license_types;
mod account_login;
mod account_oauth;
mod account_oauth_start;
mod account_profile;
mod account_security;
mod account_security_methods;
mod account_session;
mod account_signup;
#[cfg(test)]
mod account_tests;
mod account_types;
mod agent_computer;
mod agent_computer_access;
mod agent_computer_apply;
mod agent_computer_grants;
mod agent_computer_reveal;
mod agent_computer_review;
mod agent_computer_runner;
mod agent_computer_runner_auth;
mod agent_computer_store;
mod agent_computer_tools;
mod agent_computer_transport;
mod agent_v2;
mod agent_v2_browser;
mod agent_v2_computer;
mod agent_v2_local_mcp;
mod ai_usage;
mod ai_usage_guard;
mod ai_usage_limits;
mod ai_usage_permit;
#[cfg(test)]
mod ai_usage_tests;
mod assistant_api;
mod close_guard;
mod cloud_logins;
mod cloud_management;
mod cloud_sync_task;
mod commands;
mod desktop_entry;
#[doc(hidden)]
pub mod diagnostic_phone;
mod discord;
mod discord_setup;
mod http_client;
mod live_status_report;
mod local_mcp_host;
mod menu_bar_glyph;
mod menu_bar_lines;
mod menu_bar_logos;
mod menu_bar_model;
mod menu_bar_status;
mod menu_bar_window;
mod model_watch;
mod model_watch_store;
#[cfg(test)]
mod model_watch_tests;
mod native_logging;
mod native_notifications;
mod native_titles;
mod notification_route;
mod perf;
mod phone;
mod plan_limits;
mod platform_text;
mod preview_probe;
mod process_table;
mod provider_auth;
mod provider_auth_attempt;
mod provider_auth_claude;
mod provider_auth_codex;
mod provider_auth_codex_account;
mod provider_auth_files;
mod provider_auth_gemini;
mod provider_auth_gemini_account;
mod provider_auth_home;
mod provider_auth_identity;
mod provider_auth_install;
#[cfg(test)]
mod provider_auth_integration_tests;
mod provider_auth_output;
mod provider_auth_probe;
mod provider_auth_process;
mod provider_auth_registry;
mod provider_auth_round;
mod provider_auth_state;
mod provider_auth_url;
mod provider_auth_view;
mod remote_indicator;
mod renderer;
mod report;
mod report_format;
mod report_hardware;
mod report_image;
mod report_relay;
#[cfg(test)]
mod report_tests;
mod report_text;
mod restriction_monitor;
mod secret_store;
mod session_identity;
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows", test))]
mod session_process_files;
mod session_store;
#[cfg(test)]
mod session_store_tests;
pub mod shared_chats;
mod sink;
mod state;
#[cfg(test)]
mod test_shell;
mod window_preview;

pub fn handle_cli() -> Option<Result<&'static str, String>> {
    agent_v2::handle_cli().or_else(discord_setup::handle_cli)
}

pub fn run() {
    native_logging::install();
    // First, before anything asks whether an AI CLI is installed. A desktop
    // launch inherits the session manager's PATH, which has none of the
    // directories the user's shell rc adds — so `claude`, `codex` and `gemini`
    // all resolve as missing and the account rows offer a download instead of
    // a sign-in. See `vibyra_core::launch_env`.
    vibyra_core::launch_env::user_path::install();

    renderer::configure();

    #[cfg(target_os = "linux")]
    desktop_entry::install();

    // Inside the AppImage, the bundled GLib still scans the host's gio module
    // directory, where gvfs modules built against a newer GLib fail to load
    // ("undefined symbol: g_task_set_static_name"). GIO_MODULE_DIR replaces
    // that default scan with the bundled modules only (glib-networking TLS).
    #[cfg(target_os = "linux")]
    if let Ok(appdir) = std::env::var("APPDIR") {
        let bundled = format!("{appdir}/usr/lib/x86_64-linux-gnu/gio/modules");
        if std::path::Path::new(&bundled).is_dir() {
            std::env::set_var("GIO_MODULE_DIR", &bundled);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state::AppState::new())
        .setup(|app| {
            native_notifications::setup(app.handle().clone());
            account_api::set_app_version(app.package_info().version.to_string());
            plan_limits::setup(app.handle().clone());
            model_watch::spawn(app.handle().clone());
            shared_chats::desktop_stream::spawn(app.handle().clone());
            phone::notify_window(app.handle().clone());
            remote_indicator::register(app.handle().clone())?;
            restriction_monitor::start(app.handle().clone());
            agent_computer_runner::spawn(app.handle().clone());
            agent_v2::spawn(app.handle().clone());
            cloud_sync_task::spawn(app.handle().clone());
            cloud_logins::spawn(app.handle().clone());
            Ok(())
        })
        // Closing is vetoed once so the UI can warn about live terminals and
        // flush the session to disk; `confirm_close` then sets the flag and
        // closes for real. Only when a UI is mounted that can answer — see
        // `close_guard`.
        .on_window_event(cloud_sync_task::window_event)
        .invoke_handler(commands::registry::handler())
        .build(tauri::generate_context!())
        .expect("error while building Vibyra Desktop")
        .run(cloud_sync_task::run_event);
}
