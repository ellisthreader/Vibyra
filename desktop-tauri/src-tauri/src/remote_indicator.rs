//! Native session warning survives a minimized or unresponsive web UI.
use crate::state::AppState;
use serde_json::Value;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

const STOP: &str = "remote-security-stop";
const OPEN: &str = "remote-security-open";

pub fn register(app: AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(
        &app,
        "remote-security-status",
        "Remote access active",
        false,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(&app, OPEN, "Open Vibyra", true, None::<&str>)?;
    let stop = MenuItem::with_id(
        &app,
        STOP,
        "Disconnect and stop sharing",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(&app, &[&status, &open, &stop])?;
    let mut builder = TrayIconBuilder::with_id("remote-security")
        .menu(&menu)
        .tooltip("Vibyra Remote Access")
        .title("Remote access")
        .on_menu_event(|app, event| match event.id.as_ref() {
            STOP => stop_sharing(&app.state::<AppState>()),
            OPEN => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(&app)?;
    tray.set_visible(false)?;
    tauri::async_runtime::spawn(async move {
        let mut previous = None;
        loop {
            let current = {
                let state = app.state::<AppState>();
                let phone = state.phone.lock();
                phone.host.as_ref().and_then(|host| summary(&host.status()))
            };
            if current != previous {
                let result = (|| -> tauri::Result<()> {
                    if let Some(text) = &current {
                        status.set_text(text.replace('&', "&&"))?;
                        tray.set_tooltip(Some(text))?;
                        tray.set_title(Some("Remote access active"))?;
                    }
                    tray.set_visible(current.is_some())
                })();
                if result.is_err() && current.is_some() {
                    // Keep checking: new sharing cannot remain active if the
                    // persistent native warning is unavailable.
                    stop_sharing(&app.state::<AppState>());
                } else {
                    previous = current;
                }
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    });
    Ok(())
}

fn stop_sharing(state: &AppState) {
    let mut phone = state.phone.lock();
    if let Err(error) = phone.disable() {
        phone.error = Some(error);
    }
}

fn summary(status: &Value) -> Option<String> {
    let active = status["active"].as_array()?;
    if active.is_empty() {
        return None;
    }
    let names: Vec<_> = active
        .iter()
        .take(3)
        .map(|id| {
            status["devices"]
                .as_array()
                .and_then(|devices| devices.iter().find(|d| d["id"] == *id))
                .and_then(|device| device["name"].as_str())
                .unwrap_or("Approved device")
                .chars()
                .filter(|c| !c.is_control())
                .take(48)
                .collect::<String>()
        })
        .collect();
    Some(format!(
        "Remote access active: {}{}",
        names.join(", "),
        if active.len() > 3 { "…" } else { "" }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn indicator_only_names_active_devices_and_bounds_untrusted_labels() {
        assert_eq!(summary(&json!({"active":[],"devices":[]})), None);
        let label = summary(&json!({"active":["a"], "devices":[
            {"id":"a","name":"Phone\n\r\t"}, {"id":"b","name":"inactive"}]}))
        .unwrap();
        assert_eq!(label, "Remote access active: Phone");
        let label = summary(
            &json!({"active":["a","b","c","d"],"devices":[{"id":"a","name":"x".repeat(10000)}]}),
        )
        .unwrap();
        assert!(label.len() < 150 && label.ends_with('…'));
    }
    #[test]
    fn native_stop_uses_the_same_immediate_host_and_relay_shutdown() {
        let source = include_str!("phone/connection_lifecycle.rs");
        let disable = source
            .split("pub fn disable")
            .nth(1)
            .unwrap()
            .split("pub fn")
            .next()
            .unwrap();
        assert!(disable.contains("self.remote = None"));
        assert!(disable.contains("self.host = None"));
        assert!(disable.find("self.host = None").unwrap() < disable.find("save(").unwrap());
    }
}
