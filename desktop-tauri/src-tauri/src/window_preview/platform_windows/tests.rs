//! A real window on a real desktop: listed, captured and decoded. Needs an
//! interactive session, so it runs only with VIBYRA_WINDOW_CAPTURE_TESTS=1
//! (CI sets it on its Windows runner).

use super::super::dispatch::dispatch;
use serde_json::{json, Value};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::CreateSolidBrush;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostMessageW, PostQuitMessage,
    RegisterClassW, SetForegroundWindow, ShowWindow, TranslateMessage, MSG, SW_SHOW,
    WINDOW_EX_STYLE, WM_CLOSE, WM_DESTROY, WNDCLASSW, WS_OVERLAPPEDWINDOW,
};

unsafe extern "system" fn procedure(window: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    if message == WM_DESTROY {
        // SAFETY: ends this thread's message loop.
        unsafe { PostQuitMessage(0) };
        return LRESULT(0);
    }
    // SAFETY: default handling for everything else.
    unsafe { DefWindowProcW(window, message, w, l) }
}

/// A 320x240 window painted pure red, on its own message thread.
fn red_window() -> isize {
    let (sent, received) = mpsc::channel();
    std::thread::spawn(move || {
        // SAFETY: a plain Win32 window and message loop owned by this thread.
        unsafe {
            super::inventory::dpi_aware();
            let instance = GetModuleHandleW(None).unwrap();
            let class = WNDCLASSW {
                lpfnWndProc: Some(procedure),
                hInstance: instance.into(),
                lpszClassName: w!("VibyraCaptureFixture"),
                hbrBackground: CreateSolidBrush(COLORREF(0x0000_00ff)),
                ..Default::default()
            };
            RegisterClassW(&class);
            let window = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("VibyraCaptureFixture"),
                w!("Vibyra capture fixture"),
                WS_OVERLAPPEDWINDOW,
                100,
                100,
                320,
                240,
                None,
                None,
                Some(instance.into()),
                None,
            )
            .unwrap();
            let _ = ShowWindow(window, SW_SHOW);
            let _ = SetForegroundWindow(window);
            sent.send(window.0 as isize).unwrap();
            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    });
    received.recv().unwrap()
}

fn call(request: Value) -> Result<Vec<u8>, String> {
    dispatch(super::backend(), &request)
}

#[test]
fn a_real_window_is_listed_captured_and_decoded() {
    if std::env::var_os("VIBYRA_WINDOW_CAPTURE_TESTS").is_none() {
        return;
    }
    let handle = red_window();
    let id = handle as i32 as u32;
    std::thread::sleep(Duration::from_millis(500));
    let listed: Vec<Value> = serde_json::from_slice(&call(json!({"op":"list"})).unwrap()).unwrap();
    let window = listed
        .iter()
        .find(|window| window["id"] == id)
        .unwrap_or_else(|| panic!("fixture window missing from {listed:#?}"));
    assert_eq!(window["pid"], std::process::id());
    let started: Value = serde_json::from_slice(
        &call(json!({"op":"start","id":id,"fingerprint":window["fingerprint"]})).unwrap(),
    )
    .unwrap();
    let session = started["session"].as_str().unwrap().to_owned();
    let deadline = Instant::now() + Duration::from_secs(8);
    let jpeg = loop {
        match call(json!({"op":"frame","session":session})) {
            Ok(jpeg) => break jpeg,
            Err(error) if Instant::now() < deadline => {
                eprintln!("waiting: {error}");
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => panic!("no frame: {error}"),
        }
    };
    let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
    let centre = image.get_pixel(image.width() / 2, image.height() / 2);
    assert!(
        centre[0] > 200 && centre[1] < 60 && centre[2] < 60,
        "centre {centre:?}"
    );
    call(json!({"op":"stop","session":session})).unwrap();
    // SAFETY: asks the fixture window to close itself.
    unsafe {
        let _ = PostMessageW(Some(HWND(handle as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}
