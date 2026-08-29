mod account_api;
mod account_auth;
mod account_device;
mod account_oauth;
mod account_profile;
mod account_session;
#[cfg(test)]
mod account_tests;
mod account_types;
mod agent_mode;
mod ai_usage;
mod ai_usage_guard;
mod ai_usage_limits;
#[cfg(test)]
mod ai_usage_tests;
mod close_guard;
mod commands;
mod desktop_entry;
mod discord;
mod discord_setup;
mod model_watch;
mod model_watch_discord;
#[cfg(test)]
mod model_watch_tests;
mod openai_key;
mod perf;
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
mod provider_auth_state;
mod provider_auth_url;
mod provider_auth_view;
mod renderer;
mod report;
mod report_image;
#[cfg(test)]
mod report_tests;
mod report_text;
mod report_upload;
mod secret_store;
mod session_store;
#[cfg(test)]
mod session_store_tests;
mod sink;
mod state;

pub fn handle_cli() -> Option<Result<&'static str, String>> {
    discord_setup::handle_cli()
}

pub fn run() {
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
        // Must be first: a second app would own another PTY manager and race
        // the first one while both rewrite the same saved terminal session.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state::AppState::new())
        .setup(|app| {
            use tauri::Manager;

            model_watch::spawn(app.handle().clone());
            // The routine scheduler runs for the life of the process and does
            // nothing whenever no account is signed in, so it can start here
            // rather than being wired to the sign-in event.
            let hub = std::sync::Arc::clone(&app.state::<state::AppState>().agents);
            agent_mode::scheduler::start(app.handle().clone(), hub);
            Ok(())
        })
        // Closing is vetoed once so the UI can warn about live terminals and
        // flush the session to disk; `confirm_close` then sets the flag and
        // closes for real. Only when a UI is mounted that can answer — see
        // `close_guard`.
        .on_window_event(|window, event| {
            use tauri::Manager;

            let tauri::WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            if !close_guard::should_veto(&window.state::<state::AppState>()) {
                return;
            }
            api.prevent_close();
            close_guard::hand_off(window);
        })
        .invoke_handler(commands::registry::handler())
        .run(tauri::generate_context!())
        .expect("error while running Vibyra Desktop");
}
