use super::{PreviewService, RequestMetadata, Stream};
use crate::window_preview::Session;
use serde_json::json;
use std::sync::mpsc::SyncSender;
use vibyra_host::{PreviewFrame as Frame, StreamKey};

impl PreviewService {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn window_http(
        &self,
        device: &str,
        key: StreamKey,
        stream: &Stream,
        sender: &SyncSender<Frame>,
        window: &Session,
        metadata: RequestMetadata,
        body: Vec<u8>,
    ) -> Result<(), String> {
        stream.require_remote("screen:view")?;
        let path = metadata.path.split('?').next().unwrap_or("");
        let mut focus = None;
        let (status, mime, bytes) = match (metadata.method.as_str(), path) {
            ("GET", "/") => (
                200,
                "text/html; charset=utf-8",
                include_str!("../../window_preview/viewer.html")
                    .replace(
                        "data-host=\"computer\"",
                        &format!("data-host=\"{}\"", crate::window_preview::host_noun()),
                    )
                    .replace(
                        "data-control=\"false\"",
                        if window.can_control()
                            && stream.permits_remote("mouse:control")
                            && stream.permits_remote("keyboard:control")
                        {
                            "data-control=\"true\""
                        } else {
                            "data-control=\"false\""
                        },
                    )
                    .into_bytes(),
            ),
            ("GET", script) if viewer_script(script).is_some() => (
                200,
                "text/javascript; charset=utf-8",
                viewer_script(script)
                    .unwrap_or_default()
                    .as_bytes()
                    .to_vec(),
            ),
            ("GET", "/frame") => match window.frame() {
                Ok(bytes) => {
                    // Where keyboard focus is, so the phone can raise its keyboard.
                    focus = window
                        .focus()
                        .and_then(|state| crate::window_preview::focus_header(&state));
                    (200, "image/jpeg", bytes)
                }
                Err(error) => (409, "text/plain; charset=utf-8", error.into_bytes()),
            },
            ("POST", "/ready")
                if metadata.headers.iter().any(|(key, value)| {
                    key.eq_ignore_ascii_case("x-vibyra-window") && value == "1"
                }) =>
            {
                window.decoded();
                (200, "application/json", b"{\"ok\":true}".to_vec())
            }
            ("POST", "/input")
                if body.len() <= 8192
                    && metadata.headers.iter().any(|(key, value)| {
                        key.eq_ignore_ascii_case("x-vibyra-window") && value == "1"
                    }) =>
            {
                let event: serde_json::Value =
                    serde_json::from_slice(&body).map_err(|_| "Invalid window input")?;
                stream.require_window_input(&event)?;
                // Tapping and typing into a window follow the same computer
                // switch as typing into its terminals from this phone.
                if !self.typing_allowed() {
                    let refused = "Turn on typing from your phone in Vibyra's settings on your computer to tap and type in this window.";
                    (
                        403,
                        "text/plain; charset=utf-8",
                        refused.as_bytes().to_vec(),
                    )
                } else {
                    match window.input(event) {
                        Ok(focus) => (
                            200,
                            "application/json",
                            json!({"ok":true,"focus":focus}).to_string().into_bytes(),
                        ),
                        Err(error) => (409, "text/plain; charset=utf-8", error.into_bytes()),
                    }
                }
            }
            _ => (
                404,
                "text/plain",
                b"Window Preview route unavailable".to_vec(),
            ),
        };
        let mut headers = json!({
            "content-type":mime,"cache-control":"no-store","x-content-type-options":"nosniff",
            "content-security-policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        });
        if let Some(focus) = focus {
            headers[crate::window_preview::FOCUS_HEADER] = json!(focus);
        }
        let info =
            serde_json::to_vec(&json!({"v":1,"status":status,"headers":headers,"setCookies":[]}))
                .map_err(|e| e.to_string())?;
        self.queue_frame(device, stream, sender, key, Frame::Open { key })?;
        self.send_bytes(device, stream, sender, key, &info)?;
        self.send_bytes(device, stream, sender, key, &bytes)?;
        self.mark_finished(device, key);
        let end = stream.outbound.lock().end().map_err(str::to_string)?;
        self.queue_frame(device, stream, sender, key, end)
    }
}

/// The trusted viewer's scripts, compiled into the app.
fn viewer_script(path: &str) -> Option<&'static str> {
    Some(match path {
        "/viewer.js" => include_str!("../../window_preview/viewer.js"),
        "/viewer-input.js" => include_str!("../../window_preview/viewer-input.js"),
        "/viewer-typing.js" => include_str!("../../window_preview/viewer-typing.js"),
        "/viewer-keyboard.js" => include_str!("../../window_preview/viewer-keyboard.js"),
        "/viewer-pan.js" => include_str!("../../window_preview/viewer-pan.js"),
        "/viewer-sinks.js" => include_str!("../../window_preview/viewer-sinks.js"),
        "/viewer-controls.js" => include_str!("../../window_preview/viewer-controls.js"),
        "/viewer-gestures.js" => include_str!("../../window_preview/viewer-gestures.js"),
        "/viewer-zoom.js" => include_str!("../../window_preview/viewer-zoom.js"),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::viewer_script;

    /// A script the viewer loads but the computer does not serve would leave
    /// the phone with a picture it cannot tap or type into.
    #[test]
    fn every_script_the_viewer_loads_is_served() {
        let html = include_str!("../../window_preview/viewer.html");
        let mut wanted = vec!["/viewer.js".to_string()];
        assert!(html.contains(r#"<script type="module" src="/viewer.js"></script>"#));
        let mut seen = 0;
        while seen < wanted.len() {
            let source = viewer_script(&wanted[seen])
                .unwrap_or_else(|| panic!("{} is not served", wanted[seen]));
            for line in source.lines().filter(|line| line.starts_with("import ")) {
                let path = line.split('\'').nth(1).expect("quoted import path");
                let served = format!("/{}", path.trim_start_matches("./"));
                if !wanted.contains(&served) {
                    wanted.push(served);
                }
            }
            seen += 1;
        }
        assert_eq!(wanted.len(), 9, "{wanted:?}");
        assert!(viewer_script("/../viewer.html").is_none());
    }
}
