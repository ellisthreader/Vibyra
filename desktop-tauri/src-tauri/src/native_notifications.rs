use crate::notification_route::{ActivationQueue, NotificationRoute};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

static ACTIVATIONS: OnceLock<Mutex<ActivationQueue>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn drain(owner: &str) -> Vec<NotificationRoute> {
    ACTIVATIONS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .drain(owner, now())
}

pub fn setup(app: AppHandle) {
    let _ = APP.set(app);
    #[cfg(target_os = "macos")]
    unsafe {
        vibyra_notifications_setup(activated);
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn vibyra_notifications_setup(callback: extern "C" fn(*const std::ffi::c_char));
    fn vibyra_notifications_permission(ask: bool) -> i32;
    fn vibyra_notifications_show(
        id: *const std::ffi::c_char,
        title: *const std::ffi::c_char,
        body: *const std::ffi::c_char,
        route: *const std::ffi::c_char,
    ) -> bool;
}

#[cfg(target_os = "macos")]
extern "C" fn activated(raw: *const std::ffi::c_char) {
    // Swift calls synchronously with its owned UTF-8 string. Never let a panic cross C.
    let _ = std::panic::catch_unwind(|| {
        if raw.is_null() {
            return;
        }
        let bytes = unsafe { std::ffi::CStr::from_ptr(raw) }.to_bytes();
        if bytes.len() > 2048 {
            return;
        }
        if bytes.is_empty() {
            show_main_window();
            return;
        }
        let Ok(route) = serde_json::from_slice::<NotificationRoute>(bytes) else {
            return;
        };
        if !ACTIVATIONS
            .get_or_init(Mutex::default)
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(route, now())
        {
            return;
        }
        if let Some(app) = APP.get() {
            use tauri::Emitter;
            let _ = app.emit_to("main", "notification:activation", ());
            show_main_window();
        }
    });
}

#[cfg(target_os = "macos")]
fn show_main_window() {
    use tauri::Manager;
    if let Some(app) = APP.get() {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        });
    }
}

pub fn permission(ask: bool) -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    return match unsafe { vibyra_notifications_permission(ask) } {
        0 => Ok("unknown"),
        1 => Ok("granted"),
        2 => Ok("denied"),
        _ => Err("Notification permission could not be checked.".into()),
    };
    #[cfg(not(target_os = "macos"))]
    {
        let _ = ask;
        Err("Native notification routing is only available on macOS.".into())
    }
}

pub fn show(id: String, title: String, body: String, route: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let values = [id, title, body, route].map(std::ffi::CString::new);
        let [id, title, body, route] = values;
        let (id, title, body, route) = (
            id.map_err(|_| "Invalid notification")?,
            title.map_err(|_| "Invalid notification")?,
            body.map_err(|_| "Invalid notification")?,
            route.map_err(|_| "Invalid notification")?,
        );
        if unsafe {
            vibyra_notifications_show(id.as_ptr(), title.as_ptr(), body.as_ptr(), route.as_ptr())
        } {
            Ok(())
        } else {
            Err("macOS did not confirm the notification.".into())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (id, title, body, route);
        Err("Native notification routing is only available on macOS.".into())
    }
}
