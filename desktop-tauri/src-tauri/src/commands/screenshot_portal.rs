//! Compositor-authorized screenshots on Wayland, including XWayland windows.
use std::io::Read;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use dbus::arg::{PropMap, Variant};
use dbus::blocking::Connection;
use dbus::message::MatchRule;
use image::RgbaImage;

const PORTAL: &str = "org.freedesktop.portal.Desktop";
const REQUEST: &str = "org.freedesktop.portal.Request";
const PNG_LIMIT: u64 = 32 * 1024 * 1024;

struct HiddenWindow<'a>(&'a tauri::Window, bool);
impl Drop for HiddenWindow<'_> {
    fn drop(&mut self) {
        if self.1 {
            let _ = self.0.show();
        }
    }
}

pub fn capture(window: &tauri::Window, hide_window: bool) -> Result<RgbaImage, String> {
    let hide = hide_window && window.is_visible().map_err(|error| error.to_string())?;
    let restore = HiddenWindow(window, hide);
    if hide {
        window.hide().map_err(|error| error.to_string())?;
        std::thread::sleep(Duration::from_millis(100));
    }
    let path = request()?;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .and_then(|file| file.take(PNG_LIMIT + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("Could not read the screenshot: {error}"))?;
    let image = super::screenshot_png::decode_png_bytes(&bytes)?.into_rgba8();
    drop(restore);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(image)
}

fn request() -> Result<PathBuf, String> {
    let connection = Connection::new_session().map_err(unavailable)?;
    let (send, receive) = mpsc::channel();
    let rule = MatchRule::new_signal(REQUEST, "Response").with_sender(PORTAL);
    // Subscribe before requesting: a remembered permission can return immediately.
    connection
        .add_match(rule, move |(code, results): (u32, PropMap), _, message| {
            if let Some(path) = message.path() {
                let _ = send.send((path.to_string(), response(code, &results)));
            }
            true
        })
        .map_err(unavailable)?;
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(unavailable)?;
    let token: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let mut options = PropMap::new();
    options.insert(
        "handle_token".into(),
        Variant(Box::new(format!("vibyra_{token}"))),
    );
    options.insert("interactive".into(), Variant(Box::new(false)));
    let proxy = connection.with_proxy(
        PORTAL,
        "/org/freedesktop/portal/desktop",
        Duration::from_secs(5),
    );
    let (handle,): (dbus::Path<'static>,) = proxy
        .method_call(
            "org.freedesktop.portal.Screenshot",
            "Screenshot",
            ("", options),
        )
        .map_err(unavailable)?;
    let deadline = Instant::now() + Duration::from_secs(120);
    while Instant::now() < deadline {
        connection
            .process(Duration::from_millis(100))
            .map_err(unavailable)?;
        while let Ok((path, result)) = receive.try_recv() {
            if path == handle.to_string() {
                return result;
            }
        }
    }
    let request = connection.with_proxy(PORTAL, handle, Duration::from_secs(2));
    let _: Result<(), _> = request.method_call(REQUEST, "Close", ());
    Err("Screenshot permission timed out. Try capturing again.".into())
}

fn response(code: u32, results: &PropMap) -> Result<PathBuf, String> {
    match code {
        0 => {
            let uri = results
                .get("uri")
                .and_then(|value| value.0.as_str())
                .ok_or("The screenshot portal returned no image")?;
            local_path(uri)
        }
        1 => Err("Screenshot capture was cancelled.".into()),
        _ => Err(
            "The desktop could not capture the screen. Check screen-sharing permissions.".into(),
        ),
    }
}

fn local_path(uri: &str) -> Result<PathBuf, String> {
    reqwest::Url::parse(uri)
        .ok()
        .filter(|url| url.scheme() == "file")
        .and_then(|url| url.to_file_path().ok())
        .ok_or_else(|| "The screenshot portal returned an invalid local image".into())
}

fn unavailable(error: impl std::fmt::Display) -> String {
    format!("Could not use the desktop screenshot portal: {error}. Check that xdg-desktop-portal and your desktop's portal backend are installed.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_and_missing_images_are_not_successful_captures() {
        assert!(response(1, &PropMap::new())
            .unwrap_err()
            .contains("cancelled"));
        assert!(response(2, &PropMap::new()).is_err());
        assert!(response(0, &PropMap::new()).is_err());
    }

    #[test]
    fn portal_images_are_decoded_as_local_paths_without_network_access() {
        assert_eq!(
            local_path("file:///tmp/Screen%20shot%20%C3%A9.png").unwrap(),
            PathBuf::from("/tmp/Screen shot é.png")
        );
        for uri in [
            "https://example.test/image.png",
            "file://remote/tmp/image.png",
            "/tmp/image.png",
        ] {
            assert!(local_path(uri).is_err(), "{uri}");
        }
    }
}
