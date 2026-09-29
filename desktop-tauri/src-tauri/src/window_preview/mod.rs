//! Framework-independent window Preview of an application on the computer.
mod focus_header;
mod session;
pub(crate) use focus_header::{focus_header, FOCUS_HEADER};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
pub(crate) use session::Session;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindowInfo {
    pub id: u32,
    pub pid: i32,
    pub name: String,
    pub title: String,
    pub fingerprint: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Target {
    pub id: u32,
    pub pid: i32,
    pub control: bool,
}
impl Target {
    pub fn parse(value: &str) -> Result<Option<Self>, String> {
        let Some(raw) = value.strip_prefix("native-window:") else {
            return Ok(None);
        };
        let parts: Vec<_> = raw.split(':').collect();
        if parts.len() != 3 {
            return Err("Invalid window Preview target".into());
        }
        let pid = parts[0]
            .parse::<i32>()
            .map_err(|_| "Invalid window process")?;
        let id = parts[1]
            .parse::<u32>()
            .map_err(|_| "Invalid window identity")?;
        let control = match parts[2] {
            "view" => false,
            "control" => true,
            _ => return Err("Invalid window permission".into()),
        };
        if pid <= 0 || id == 0 || parts[0] != pid.to_string() || parts[1] != id.to_string() {
            return Err("Invalid window Preview target".into());
        }
        Ok(Some(Self { id, pid, control }))
    }
    pub fn info(self) -> Result<WindowInfo, String> {
        let info: WindowInfo =
            serde_json::from_slice(&request(json!({"op":"info", "id":self.id}))?)
                .map_err(|e| e.to_string())?;
        if info.pid != self.pid {
            return Err(format!(
                "Window process changed. Select it again on your {}.",
                host_noun()
            ));
        }
        Ok(info)
    }
}

pub fn available() -> bool {
    request(json!({"op":"available"})).is_ok()
}
pub fn list() -> Result<Vec<WindowInfo>, String> {
    serde_json::from_slice(&request(json!({"op":"list"}))?).map_err(|e| e.to_string())
}
pub fn permission() -> Result<(), String> {
    request(json!({"op":"permission"})).map(|_| ())
}

/// A readable name for the computer in messages shown on the phone.
pub(crate) fn host_noun() -> &'static str {
    if cfg!(target_os = "macos") {
        "Mac"
    } else if cfg!(windows) {
        "PC"
    } else {
        "computer"
    }
}

// macOS captures in Swift (ScreenCaptureKit); Windows and Linux share one
// Rust dispatcher over their own backends. The JSON operations are the same.
#[cfg(any(windows, target_os = "linux", test))]
mod native;
#[cfg(target_os = "macos")]
#[path = "platform_macos.rs"]
mod platform;
#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
#[path = "platform_unsupported.rs"]
mod platform;
#[cfg(any(windows, target_os = "linux"))]
use native::request;
#[cfg(not(any(windows, target_os = "linux")))]
use platform::request;

#[cfg(test)]
mod tests {
    use super::Target;
    #[test]
    fn targets_are_canonical_and_permission_is_explicit() {
        assert_eq!(Target::parse("vite").unwrap(), None);
        assert!(
            !Target::parse("native-window:22:3:view")
                .unwrap()
                .unwrap()
                .control
        );
        assert!(
            Target::parse("native-window:22:3:control")
                .unwrap()
                .unwrap()
                .control
        );
        for id in [
            "native-window:0:3:view",
            "native-window:1:0:view",
            "native-window:01:2:view",
            "native-window:1:2:all",
            "native-window:1:2:view:extra",
        ] {
            assert!(Target::parse(id).is_err(), "{id}");
        }
    }
}
