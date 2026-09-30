//! A live, borrowed authority check for one synchronous input request.
//! Never serialize this predicate or retain it beyond the native call.
pub(crate) type InputCheck<'a> = dyn Fn() -> Result<(), String> + Sync + 'a;

pub(crate) fn denied() -> Result<(), String> {
    Err("Window input authorization ended. Reconnect to control this window.".into())
}

/// Target queries may block; check the same authority again after they finish.
#[cfg(any(windows, target_os = "linux", test))]
pub(crate) fn require_target(
    check: &InputCheck<'_>,
    target: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    check()?;
    target()?;
    check()
}

#[cfg(test)]
#[path = "tests_input_target.rs"]
mod tests;
