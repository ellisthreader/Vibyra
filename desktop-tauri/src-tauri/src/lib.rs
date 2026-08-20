mod account_api;
mod account_auth;
mod account_device;
mod account_oauth;
mod account_profile;
mod account_session;
#[cfg(test)]
mod account_tests;
mod account_types;
mod ai_usage;
mod ai_usage_guard;
mod ai_usage_limits;
#[cfg(test)]
mod ai_usage_tests;
mod commands;
mod model_watch;
#[cfg(test)]
mod model_watch_tests;
mod openai_key;
mod provider_auth;
mod provider_auth_attempt;
mod provider_auth_codex;
mod provider_auth_files;
mod provider_auth_gemini;
#[cfg(test)]
mod provider_auth_integration_tests;
mod provider_auth_process;
mod provider_auth_state;
mod provider_auth_url;
mod renderer;
mod secret_store;
mod session_store;
#[cfg(test)]
mod session_store_tests;
mod sink;
mod state;

use commands::{
    account, agents, ai, ai_memory, ai_service, fs, memory, memory_browser, preview,
    provider_accounts, render, screenshot, session, settings, terminal, voice,
};

// A raw AppImage has no desktop integration: GNOME labels the window with its
// WM_CLASS and has no icon for it at startup. Install a user-level desktop
// entry and icon on launch so docks and launchers show "Vibyra" and the V mark.
// Rewritten whenever the AppImage path changes, so a moved file keeps working.
#[cfg(target_os = "linux")]
fn install_desktop_integration() {
    let Ok(appimage) = std::env::var("APPIMAGE") else {
        return;
    };
    let data_home = std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .filter(|home| !home.is_empty())
                .map(|home| format!("{home}/.local/share"))
        });
    let Some(data_home) = data_home else { return };
    let icon_dir = format!("{data_home}/icons/hicolor/256x256/apps");
    let applications_dir = format!("{data_home}/applications");
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Vibyra\nComment=Vibyra AI terminal workspace\nExec=\"{appimage}\" %U\nIcon=vibyra\nTerminal=false\nCategories=Development;\nStartupWMClass=Vibyra\n"
    );
    let _ = std::fs::create_dir_all(&icon_dir);
    let _ = std::fs::create_dir_all(&applications_dir);
    let _ = std::fs::write(
        format!("{icon_dir}/vibyra.png"),
        include_bytes!("../icons/128x128@2x.png"),
    );
    let entry_path = format!("{applications_dir}/vibyra.desktop");
    if std::fs::read_to_string(&entry_path).unwrap_or_default() != entry {
        let _ = std::fs::write(&entry_path, entry);
        let _ = std::process::Command::new("update-desktop-database")
            .arg(&applications_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        let _ = std::process::Command::new("gtk-update-icon-cache")
            .args(["-f", "-t", &format!("{data_home}/icons/hicolor")])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
}

pub fn run() {
    renderer::configure();

    #[cfg(target_os = "linux")]
    install_desktop_integration();

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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state::AppState::new())
        .setup(|app| {
            model_watch::spawn(app.handle().clone());
            Ok(())
        })
        // Closing is vetoed once so the UI can warn about live terminals and
        // flush the session to disk; `confirm_close` then sets the flag and
        // closes for real.
        .on_window_event(|window, event| {
            use tauri::Manager;

            let tauri::WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            let state = window.state::<state::AppState>();
            if state.closing.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            api.prevent_close();
            let _ = tauri::Emitter::emit(window, "vibyra://close-requested", ());
        })
        .invoke_handler(tauri::generate_handler![
            account::account_snapshot,
            account::account_restore,
            account::account_login_email,
            account::account_signup_email,
            account::account_oauth_start,
            account::account_oauth_cancel,
            account::account_profile_refresh,
            account::account_profile_update,
            account::account_password_forgot,
            account::account_resend_verification,
            account::account_logout,
            account::account_open_legal,
            terminal::create_terminal,
            terminal::safe_workspace_preflight,
            terminal::create_ssh_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::set_terminal_visibility,
            terminal::terminal_snapshot,
            terminal::kill_terminal,
            terminal::remove_terminal,
            terminal::list_terminals,
            agents::list_agents,
            render::renderer_policy,
            provider_accounts::provider_accounts,
            provider_accounts::connect_provider_account,
            provider_accounts::cancel_provider_account,
            provider_accounts::open_provider_sign_in_page,
            provider_accounts::disconnect_provider_account,
            fs::fs_list_dir,
            fs::fs_read_preview,
            fs::fs_home_dir,
            fs::watch_workspace,
            fs::unwatch_workspace,
            preview::preview_inspect,
            preview::preview_start,
            preview::preview_status,
            preview::preview_stop,
            preview::preview_stop_project,
            session::save_terminal_session,
            session::load_terminal_session,
            session::clear_terminal_session,
            session::confirm_close,
            settings::get_settings,
            settings::save_settings,
            screenshot::capture_screen,
            screenshot::finish_screenshot_edit,
            screenshot::copy_screenshot,
            screenshot::copy_saved_screenshot,
            screenshot::save_screenshot,
            voice::voice_status,
            voice::voice_start,
            voice::voice_stop,
            ai::ai_chat,
            ai_memory::load_memory,
            ai_memory::save_memory,
            ai_service::ai_service_status,
            ai_service::set_openai_key,
            ai_service::clear_openai_key,
            ai_service::open_openai_key_page,
            memory::memory_sources,
            memory::connect_obsidian_vault,
            memory::disconnect_obsidian_vault,
            memory::pick_memory_files,
            memory::search_memory_sources,
            memory_browser::memory_note_index,
            memory_browser::read_memory_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vibyra Desktop");
}
