//! The Swift ScreenCaptureKit adapter, linked by build_window_preview.rs.
use serde_json::Value;

pub(super) fn request(value: Value) -> Result<Vec<u8>, String> {
    unsafe extern "C" {
        fn vibyra_window_request(
            bytes: *const u8,
            count: usize,
            length: *mut usize,
            status: *mut i32,
        ) -> *mut u8;
        fn vibyra_window_free(bytes: *mut u8);
    }
    let input = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    let (mut length, mut status) = (0, 0);
    // Swift owns the buffer until the matching free; no pointer crosses IPC.
    let output = unsafe {
        let pointer = vibyra_window_request(input.as_ptr(), input.len(), &mut length, &mut status);
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
