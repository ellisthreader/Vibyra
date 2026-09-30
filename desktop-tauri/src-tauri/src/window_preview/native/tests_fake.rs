//! A fake Windows/Linux backend for the focus and typing tests: it records
//! input, reports whatever focus a test sets, and can stall like a hung app.

use super::backend::{Backend, Bgra, Geometry, Source};
use super::capture::Capture;
use super::focus::{Field, Focused};
use super::input::InputEvent;
use crate::window_preview::WindowInfo;
use parking_lot::Mutex;
use serde_json::Value;
use std::time::{Duration, Instant};

#[derive(Default)]
pub(super) struct Fake {
    pub inputs: Mutex<Vec<InputEvent>>,
    pub focused: Mutex<Focused>,
    /// A click focuses this field after a short delay, as real apps do.
    pub click_focuses: Mutex<Option<Focused>>,
    pub pending: Mutex<Option<(Instant, Focused)>>,
    /// An application that takes this long to answer.
    pub stall: Mutex<Duration>,
    /// Input injection can also wait on the application.
    pub input_stall: Mutex<Duration>,
}

struct Grey;
impl Source for Grey {
    fn grab(&mut self) -> Result<Option<Bgra>, String> {
        Ok(Some(Bgra {
            width: 64,
            height: 48,
            stride: 256,
            data: vec![90; 64 * 48 * 4],
        }))
    }
}

fn window() -> Geometry {
    Geometry {
        info: WindowInfo {
            id: 3,
            pid: 9,
            name: "App".into(),
            title: "Sign in".into(),
            fingerprint: "f".into(),
        },
        x: 100.0,
        y: 50.0,
        width: 800.0,
        height: 600.0,
    }
}

pub(super) fn field(kind: &'static str, rect: [f64; 4]) -> Field {
    Field {
        kind,
        rect: Some(rect),
        caret: None,
        label: "Email address".into(),
        empty: Some(true),
    }
}

impl Backend for Fake {
    fn inventory(&self) -> Result<Vec<Geometry>, String> {
        Ok(vec![window()])
    }
    fn info(&self, _: u32) -> Result<Geometry, String> {
        Ok(window())
    }
    fn open(&self, _: &Geometry) -> Result<Box<dyn Source>, String> {
        Ok(Box::new(Grey))
    }
    fn input(&self, _: &Geometry, event: &InputEvent) -> Result<(), String> {
        let wait = *self.input_stall.lock();
        self.inputs.lock().push(event.clone());
        if matches!(event, InputEvent::Click { .. }) {
            if let Some(next) = self.click_focuses.lock().take() {
                *self.pending.lock() = Some((Instant::now() + Duration::from_millis(60), next));
            }
        }
        std::thread::sleep(wait);
        Ok(())
    }
    fn focus(&self, _: &Geometry) -> Result<Focused, String> {
        std::thread::sleep(*self.stall.lock());
        let mut pending = self.pending.lock();
        if pending
            .as_ref()
            .is_some_and(|(due, _)| Instant::now() >= *due)
        {
            *self.focused.lock() = pending.take().unwrap().1;
        }
        Ok(self.focused.lock().clone())
    }
    fn fields(&self, _: &Geometry) -> Vec<Field> {
        vec![
            field("email", [150.0, 110.0, 300.0, 30.0]),
            field("secure", [150.0, 160.0, 300.0, 30.0]),
            // Partly outside the window: clipped. Wholly outside: left out.
            field("text", [850.0, 600.0, 100.0, 30.0]),
            field("text", [2000.0, 2000.0, 100.0, 30.0]),
        ]
    }
}

/// Frames read focus from a background reader: ask until it shows up.
pub(super) fn eventually(capture: &Capture, ready: impl Fn(&Value) -> bool) -> Value {
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let state = capture.focus().unwrap();
        if ready(&state) || Instant::now() > deadline {
            return state;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}

pub(super) fn capture() -> (&'static Fake, std::sync::Arc<Capture>) {
    let backend: &'static Fake = Box::leak(Box::default());
    let capture = Capture::start(backend, window()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while capture.frame().is_err() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    (backend, capture)
}
