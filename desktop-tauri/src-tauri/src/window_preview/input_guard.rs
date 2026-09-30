//! A live, borrowed authority check for one synchronous input request.
//! Never serialize this predicate or retain it beyond the native call.
pub(crate) type InputCheck<'a> = dyn Fn() -> Result<(), String> + Sync + 'a;

pub(crate) fn denied() -> Result<(), String> {
    Err("Window input authorization ended. Reconnect to control this window.".into())
}
