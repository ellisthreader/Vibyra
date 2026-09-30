//! Window Preview for Windows and Linux: one dispatcher speaking the same JSON
//! operations as the macOS Swift adapter, over a per-OS [`Backend`].
mod backend;
mod capture;
mod dispatch;
mod encode;
mod fields;
mod focus;
mod input;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_fake;
#[cfg(test)]
mod tests_focus;
#[cfg(test)]
mod tests_focus_fresh;
#[cfg(test)]
mod tests_focus_reader;
#[cfg(test)]
mod tests_keys;

#[cfg(windows)]
#[path = "../platform_windows/mod.rs"]
mod os;
#[cfg(target_os = "linux")]
#[path = "../platform_linux/mod.rs"]
mod os;

#[allow(unused_imports)]
pub(crate) use backend::{Backend, Bgra, Geometry, Source};
#[allow(unused_imports)]
pub(crate) use fields::{fraction, kind};
#[allow(unused_imports)]
pub(crate) use focus::{Field, Focused};
#[allow(unused_imports)]
pub(crate) use input::{Action, InputEvent, Key};

#[cfg(any(windows, target_os = "linux"))]
pub(super) fn request(value: serde_json::Value) -> Result<Vec<u8>, String> {
    dispatch::dispatch(os::backend(), &value)
}
