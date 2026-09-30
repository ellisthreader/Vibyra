//! The Swift ScreenCaptureKit adapter, linked by build_window_preview.rs.
use super::InputCheck;
use serde_json::Value;
use std::ffi::c_void;

struct Context<'a> {
    check: &'a InputCheck<'a>,
}

unsafe extern "C" fn verify(context: *const c_void) -> i32 {
    if context.is_null() {
        return 0;
    }
    // Context is borrowed by the synchronous Swift call only; check is Sync.
    let context = unsafe { &*context.cast::<Context<'_>>() };
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (context.check)()))
        .is_ok_and(|result| result.is_ok()) as i32
}

pub(super) fn request(value: Value) -> Result<Vec<u8>, String> {
    request_input(value, &super::input_guard::denied)
}

pub(super) fn request_input(value: Value, check: &InputCheck<'_>) -> Result<Vec<u8>, String> {
    unsafe extern "C" {
        fn vibyra_window_request(
            bytes: *const u8,
            count: usize,
            length: *mut usize,
            status: *mut i32,
            check: unsafe extern "C" fn(*const c_void) -> i32,
            context: *const c_void,
        ) -> *mut u8;
        fn vibyra_window_free(bytes: *mut u8);
    }
    let input = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    let (mut length, mut status) = (0, 0);
    let context = Context { check };
    // Swift owns the buffer until the matching free; no pointer crosses IPC.
    let output = unsafe {
        let pointer = vibyra_window_request(
            input.as_ptr(),
            input.len(),
            &mut length,
            &mut status,
            verify,
            (&context as *const Context<'_>).cast(),
        );
        if pointer.is_null() {
            return Err("Window capture returned no data".into());
        }
        let bytes = std::slice::from_raw_parts(pointer, length).to_vec();
        vibyra_window_free(pointer);
        bytes
    };
    if status != 0 {
        Err(String::from_utf8_lossy(&output).into_owned())
    } else {
        Ok(output)
    }
}

#[cfg(test)]
#[path = "tests_macos_input_guard.rs"]
mod tests_macos_input_guard;
