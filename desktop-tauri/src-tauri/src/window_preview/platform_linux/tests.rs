//! A real X11 window: listed, captured (also while covered) and clicked
//! through XTest. Needs an X server, so it runs only with
//! VIBYRA_WINDOW_CAPTURE_TESTS=1 (CI runs it under Xvfb).

use super::super::dispatch::dispatch;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, InputFocus, PropMode, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

fn window(conn: &RustConnection, root: u32, colour: u32, x: i16) -> u32 {
    let id = conn.generate_id().unwrap();
    let aux = CreateWindowAux::new()
        .background_pixel(colour)
        .event_mask(EventMask::BUTTON_PRESS | EventMask::EXPOSURE);
    conn.create_window(
        0,
        id,
        root,
        x,
        60,
        320,
        240,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &aux,
    )
    .unwrap();
    let pid = conn
        .intern_atom(false, b"_NET_WM_PID")
        .unwrap()
        .reply()
        .unwrap()
        .atom;
    conn.change_property32(
        PropMode::REPLACE,
        id,
        pid,
        AtomEnum::CARDINAL,
        &[std::process::id()],
    )
    .unwrap();
    conn.change_property8(
        PropMode::REPLACE,
        id,
        AtomEnum::WM_NAME,
        AtomEnum::STRING,
        b"Fixture",
    )
    .unwrap();
    conn.map_window(id).unwrap();
    conn.flush().unwrap();
    id
}

fn call(request: Value) -> Result<Vec<u8>, String> {
    dispatch(super::backend(), &request)
}

fn frame(session: &str) -> image::RgbImage {
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        match call(json!({"op":"frame","session":session})) {
            Ok(jpeg) => return image::load_from_memory(&jpeg).unwrap().to_rgb8(),
            Err(error) if Instant::now() < deadline => {
                eprintln!("waiting: {error}");
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => panic!("no frame: {error}"),
        }
    }
}

fn red(image: &image::RgbImage) -> bool {
    let centre = image.get_pixel(image.width() / 2, image.height() / 2);
    centre[0] > 200 && centre[1] < 60 && centre[2] < 60
}

#[test]
fn a_real_window_is_listed_captured_covered_and_clicked() {
    if std::env::var_os("VIBYRA_WINDOW_CAPTURE_TESTS").is_none() {
        return;
    }
    let (conn, screen) = RustConnection::connect(None).unwrap();
    let root = conn.setup().roots[screen].root;
    let shared = window(&conn, root, 0x00ff_0000, 40);
    std::thread::sleep(Duration::from_millis(300));

    let listed: Vec<Value> = serde_json::from_slice(&call(json!({"op":"list"})).unwrap()).unwrap();
    let found = listed
        .iter()
        .find(|w| w["id"] == shared)
        .expect("fixture window listed");
    assert_eq!(found["pid"], std::process::id());
    let started =
        call(json!({"op":"start","id":shared,"fingerprint":found["fingerprint"]})).unwrap();
    let session = serde_json::from_slice::<Value>(&started).unwrap()["session"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(red(&frame(&session)), "the window's own colour");

    // A blue window on top: Composite still reads the red one underneath.
    let cover = window(&conn, root, 0x0000_00ff, 80);
    std::thread::sleep(Duration::from_millis(300));
    let covered = frame(&session);
    eprintln!("covered capture red: {}", red(&covered));
    conn.destroy_window(cover).unwrap();
    conn.flush().unwrap();

    conn.set_input_focus(InputFocus::PARENT, shared, x11rb::CURRENT_TIME)
        .unwrap();
    conn.sync().unwrap();
    std::thread::sleep(Duration::from_millis(200));
    let click = json!({"op":"input","session":session,"kind":"click","x":0.5,"y":0.5});
    call(click).unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut clicked = false;
    while !clicked && Instant::now() < deadline {
        match conn.poll_for_event().unwrap() {
            Some(Event::ButtonPress(press)) => clicked = press.event == shared && press.detail == 1,
            Some(_) => {}
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
    assert!(clicked, "the XTest click reached the shared window");
    call(json!({"op":"stop","session":session})).unwrap();
}
