use serde_json::Value;

pub(super) fn request(_: Value) -> Result<Vec<u8>, String> {
    Err("Window Preview is not available on this operating system.".into())
}

pub(super) fn request_input(
    value: Value,
    check: &super::InputCheck<'_>,
) -> Result<Vec<u8>, String> {
    check()?;
    request(value)
}
