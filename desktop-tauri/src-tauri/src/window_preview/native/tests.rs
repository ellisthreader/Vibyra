//! The Windows/Linux dispatcher against a fake backend, so every build checks
//! the contract the Mac adapter and the phone viewer rely on.

use super::backend::{Backend, Bgra, Geometry, Source};
use super::dispatch::dispatch;
use super::input::InputEvent;
use crate::window_preview::WindowInfo;
use parking_lot::Mutex;
use serde_json::{json, Value};

#[derive(Default)]
struct Fake {
    windows: Mutex<Vec<Geometry>>,
    inputs: Mutex<Vec<InputEvent>>,
}

struct Red;
impl Source for Red {
    fn grab(&mut self) -> Result<Option<Bgra>, String> {
        let (width, height) = (2000u32, 1000u32);
        let data = [0u8, 0, 255, 255].repeat((width * height) as usize);
        Ok(Some(Bgra {
            width,
            height,
            stride: width as usize * 4,
            data,
        }))
    }
}

impl Backend for Fake {
    fn inventory(&self) -> Result<Vec<Geometry>, String> {
        Ok(self.windows.lock().clone())
    }
    fn info(&self, id: u32) -> Result<Geometry, String> {
        let windows = self.windows.lock();
        let found = windows.iter().find(|window| window.info.id == id);
        found
            .cloned()
            .ok_or_else(|| "This application window closed.".into())
    }
    fn open(&self, _: &Geometry) -> Result<Box<dyn Source>, String> {
        Ok(Box::new(Red))
    }
    fn input(&self, _: &Geometry, event: &InputEvent) -> Result<(), String> {
        self.inputs.lock().push(event.clone());
        Ok(())
    }
}

fn window(id: u32, fingerprint: &str) -> Geometry {
    Geometry {
        info: WindowInfo {
            id,
            pid: 7,
            name: "App".into(),
            title: "Window".into(),
            fingerprint: fingerprint.into(),
        },
        x: 10.0,
        y: 20.0,
        width: 800.0,
        height: 600.0,
    }
}

fn call(backend: &'static Fake, request: Value) -> Result<Vec<u8>, String> {
    dispatch(backend, &request)
}

fn start(backend: &'static Fake, id: u32, fingerprint: &str) -> Result<String, String> {
    let bytes = call(
        backend,
        json!({"op":"start","id":id,"fingerprint":fingerprint}),
    )?;
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    Ok(value["session"].as_str().unwrap().to_owned())
}

fn frame(backend: &'static Fake, token: &str) -> Result<Vec<u8>, String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match call(backend, json!({"op":"frame","session":token})) {
            Err(waiting)
                if waiting.contains("first frame") && std::time::Instant::now() < deadline =>
            {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            other => return other,
        }
    }
}

#[test]
fn windows_and_linux_follow_the_mac_window_contract() {
    let backend: &'static Fake = Box::leak(Box::default());
    backend
        .windows
        .lock()
        .extend((1..=5).map(|id| window(id, &format!("f{id}"))));

    let listed: Value =
        serde_json::from_slice(&call(backend, json!({"op":"list"})).unwrap()).unwrap();
    assert_eq!(listed[0]["fingerprint"], "f1");
    assert_eq!(listed[0]["width"], 800.0);
    assert_eq!(
        call(backend, json!({"op":"permission"})).unwrap(),
        br#"{"allowed":true}"#
    );
    assert!(start(backend, 1, "stale")
        .unwrap_err()
        .contains("identity changed"));

    let token = start(backend, 1, "f1").unwrap();
    let jpeg = frame(backend, &token).unwrap();
    let image = image::load_from_memory(&jpeg).unwrap().to_rgb8();
    assert_eq!(
        (image.width(), image.height()),
        (1280, 640),
        "long side capped at 1280"
    );
    let centre = image.get_pixel(640, 320);
    assert!(
        centre[0] > 230 && centre[1] < 30 && centre[2] < 30,
        "{centre:?}"
    );

    let click = json!({"op":"input","session":token,"kind":"click","x":0.5,"y":0.25});
    call(backend, click).unwrap();
    assert_eq!(
        backend.inputs.lock()[0],
        InputEvent::Click {
            x: 0.5,
            y: 0.25,
            right: false
        }
    );
    for bad in [
        json!({"kind":"click","x":1.5,"y":0}),
        json!({"kind":"text","text":""}),
        json!({"kind":"key","key":"f1"}),
    ] {
        let mut bad = bad;
        bad["op"] = json!("input");
        bad["session"] = json!(token);
        assert!(call(backend, bad).is_err());
    }

    let others = (2..=4)
        .map(|id| start(backend, id, &format!("f{id}")).unwrap())
        .collect::<Vec<_>>();
    assert!(start(backend, 5, "f5")
        .unwrap_err()
        .contains("Close another"));

    backend.windows.lock()[0].width = 900.0;
    assert!(frame(backend, &token).unwrap_err().contains("resized"));
    backend.windows.lock()[0] = window(1, "restarted");
    assert!(frame(backend, &token).unwrap_err().contains("restarted"));

    for token in others.iter().chain([&token]) {
        call(backend, json!({"op":"stop","session":token})).unwrap();
    }
    assert!(frame(backend, &token).unwrap_err().contains("ended"));
    assert!(call(backend, json!({"op":"list","pad":"x".repeat(20_000)})).is_err());
}
