use super::backend::Backend;
use super::capture::Capture;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

const MAX_SESSIONS: usize = 4;
const MAX_REQUEST: usize = 16 * 1024;

#[derive(Default)]
struct Registry {
    sessions: HashMap<String, Arc<Capture>>,
    pending: usize,
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Default::default)
}

fn bytes(value: Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&value).map_err(|e| e.to_string())
}

#[cfg(test)]
pub(super) fn dispatch(backend: &'static dyn Backend, request: &Value) -> Result<Vec<u8>, String> {
    dispatch_checked(backend, request, &|| Ok(()))
}

pub(super) fn dispatch_checked(
    backend: &'static dyn Backend,
    request: &Value,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<Vec<u8>, String> {
    if request.to_string().len() > MAX_REQUEST {
        return Err("Invalid window Preview request.".into());
    }
    let id = || {
        request["id"]
            .as_u64()
            .and_then(|id| u32::try_from(id).ok())
            .unwrap_or(0)
    };
    match request["op"].as_str() {
        Some("available") => backend
            .available()
            .and_then(|_| bytes(json!({"available":true}))),
        // Windows and X11 need no capture permission from the user.
        Some("permission") => bytes(json!({"allowed":true})),
        Some("list") => bytes(json!(backend.inventory()?)),
        Some("info") => bytes(json!(backend.info(id())?)),
        Some("start") => start(backend, id(), request["fingerprint"].as_str().unwrap_or("")),
        Some(op @ ("frame" | "stop" | "input" | "focus")) => {
            let token = request["session"].as_str().unwrap_or("");
            let capture = {
                let mut registry = registry().lock();
                if op == "stop" {
                    registry.sessions.remove(token)
                } else {
                    registry.sessions.get(token).cloned()
                }
            }
            .ok_or("Window Preview ended.")?;
            match op {
                "stop" => {
                    capture.stop();
                    Ok(Vec::new())
                }
                "input" => capture
                    .input_checked(request, check)
                    .and_then(|focus| bytes(json!({"ok":true,"focus":focus}))),
                "focus" => bytes(capture.focus()?),
                _ => capture.frame(),
            }
        }
        _ => Err("Unsupported window Preview operation.".into()),
    }
}

fn start(backend: &'static dyn Backend, id: u32, fingerprint: &str) -> Result<Vec<u8>, String> {
    {
        let mut registry = registry().lock();
        if registry.sessions.len() + registry.pending >= MAX_SESSIONS {
            return Err("Close another window Preview before opening this one.".into());
        }
        registry.pending += 1;
    }
    let started = (|| {
        let window = backend.info(id)?;
        if window.info.fingerprint != fingerprint {
            return Err("Window identity changed.".to_string());
        }
        Capture::start(backend, window)
    })();
    let mut registry = registry().lock();
    registry.pending -= 1;
    let capture = started?;
    let mut raw = [0u8; 16];
    getrandom::fill(&mut raw).map_err(|e| e.to_string())?;
    let token = raw.iter().map(|b| format!("{b:02x}")).collect::<String>();
    registry.sessions.insert(token.clone(), capture);
    bytes(json!({"session":token}))
}
