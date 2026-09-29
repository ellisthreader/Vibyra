use serde_json::Value;

pub(super) fn request(_: Value) -> Result<Vec<u8>, String> {
    Err("Window Preview is not available on this operating system.".into())
}
