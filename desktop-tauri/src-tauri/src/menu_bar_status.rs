//! Live agent status in the menu bar and on the Dock icon.
//!
//! The renderer already knows which panes are working or waiting (it derives
//! that on a slow tick in `lib/activity.ts`) and sends a small snapshot here
//! only when it changes. This module turns it into one menu bar item — a
//! template glyph, a short title and a native menu of rows that each open their
//! terminal — and a Dock badge counting the agents that need an answer.
//!
//! Separate from `remote_indicator.rs`: that icon is a security warning and must
//! never share a menu or a switch with this one. Only pane titles and project
//! names arrive here; no prompt text or terminal output does.
use parking_lot::Mutex;
use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Wry,
};

use crate::menu_bar_glyph::draw;
use crate::menu_bar_logos::logo;
use crate::menu_bar_model::{
    badge, glyph, lead, lines, sanitize, title, valid_key, StatusSnapshot, OPEN,
};

const TRAY_ID: &str = "live-status";

static LAST: Mutex<Option<StatusSnapshot>> = Mutex::new(None);

fn build_menu(app: &AppHandle, snap: &StatusSnapshot) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for (index, line) in lines(snap).into_iter().enumerate() {
        let Some(line) = line else {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            continue;
        };
        let id = if line.id.is_empty() {
            format!("live-status-label-{index}")
        } else {
            line.id
        };
        match logo(&line.agent) {
            Some((image, _)) => menu.append(&IconMenuItem::with_id(
                app,
                id,
                line.label,
                line.enabled,
                Some(image),
                None::<&str>,
            )?)?,
            None => menu.append(&MenuItem::with_id(
                app,
                id,
                line.label,
                line.enabled,
                None::<&str>,
            )?)?,
        }
    }
    Ok(menu)
}

fn on_menu(app: &AppHandle, id: &str) {
    crate::menu_bar_window::show_main(app);
    if let Some(key) = id.strip_prefix(OPEN).filter(|key| valid_key(key)) {
        let _ = app.emit("menu-bar:open", key.to_string());
    }
}

/// Applies a snapshot: icon, title, menu and Dock badge. Never fatal.
pub fn apply(app: &AppHandle, snap: StatusSnapshot) {
    let snap = sanitize(snap);
    // Claim the snapshot, then release the lock before any tray call: those
    // hop to the main thread, and a second caller holding the lock there
    // would deadlock against this one.
    {
        let mut last = LAST.lock();
        if last.as_ref() == Some(&snap) {
            return;
        }
        *last = Some(snap.clone());
    }
    crate::live_status_report::report(app, &snap);
    crate::menu_bar_window::set_badge(app, badge(&snap));
    if !snap.enabled {
        let _ = app.remove_tray_by_id(TRAY_ID);
        return;
    }
    let Ok(menu) = build_menu(app, &snap) else {
        *LAST.lock() = None;
        return;
    };
    // Working: the model's own logo. Waiting on you or idle: the drawn glyph.
    let working_logo = lead(&snap)
        .filter(|_| snap.attention.is_empty())
        .and_then(|row| logo(&row.agent));
    let (icon, template) = match working_logo {
        Some(found) => found,
        None => {
            let (rgba, size) = draw(glyph(&snap));
            (Image::new_owned(rgba, size, size), true)
        }
    };
    let text = title(&snap);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_icon(Some(icon));
        let _ = tray.set_icon_as_template(template);
        // An explicit empty title: `set_title(None)` leaves the old words in
        // place on macOS (seen on 0.8.21 build 75), so idle kept saying "1 needs you".
        let _ = tray.set_title(Some(text.as_deref().unwrap_or("")));
    } else {
        let built = TrayIconBuilder::with_id(TRAY_ID)
            .menu(&menu)
            .icon(icon)
            .icon_as_template(template)
            .tooltip("Vibyra agents")
            .title(text.as_deref().unwrap_or(""))
            .on_menu_event(|app, event| on_menu(app, event.id.as_ref()))
            .build(app);
        if built.is_err() {
            *LAST.lock() = None;
            tracing::warn!("menu bar status is unavailable in this session");
        }
    }
}
