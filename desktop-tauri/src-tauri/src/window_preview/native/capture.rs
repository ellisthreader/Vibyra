//! One window's continuous capture: a thread keeps only the newest JPEG, and
//! the viewer takes whatever is newest when it asks. No frame queue builds up.

use super::backend::{Backend, Geometry};
use super::encode::jpeg;
use super::focus::Tracker;
use super::input::{Action, InputEvent};
use crate::window_preview::host_noun;
use parking_lot::Mutex;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

/// Eight frames a second, as on the Mac.
const INTERVAL: Duration = Duration::from_millis(125);
const OPEN_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default)]
struct Latest {
    jpeg: Option<Arc<Vec<u8>>>,
    problem: Option<String>,
}

pub(super) struct Capture {
    backend: &'static dyn Backend,
    window: Geometry,
    latest: Arc<Mutex<Latest>>,
    stopped: Arc<AtomicBool>,
    focus: Arc<Tracker>,
}

impl Capture {
    pub fn start(backend: &'static dyn Backend, window: Geometry) -> Result<Arc<Self>, String> {
        let latest = Arc::new(Mutex::new(Latest::default()));
        let stopped = Arc::new(AtomicBool::new(false));
        let (opened, wait) = mpsc::channel();
        let focus = Arc::new(Tracker::default());
        let (target, shared, stop) = (window.clone(), Arc::clone(&latest), Arc::clone(&stopped));
        let moved = Arc::clone(&focus);
        std::thread::Builder::new()
            .name("vibyra-window-capture".into())
            .spawn(move || {
                let mut source = match backend.open(&target) {
                    Ok(source) => {
                        let _ = opened.send(Ok(()));
                        source
                    }
                    Err(error) => {
                        let _ = opened.send(Err(error));
                        return;
                    }
                };
                while !stop.load(Ordering::Acquire) {
                    let began = Instant::now();
                    let result = source
                        .grab()
                        .and_then(|frame| frame.map(|f| jpeg(&f)).transpose());
                    {
                        let mut latest = shared.lock();
                        match result {
                            Ok(Some(bytes)) => {
                                latest.jpeg = Some(Arc::new(bytes));
                                latest.problem = None;
                                moved.frame_changed();
                            }
                            Ok(None) => {}
                            Err(problem) => latest.problem = Some(problem),
                        }
                    }
                    std::thread::sleep(INTERVAL.saturating_sub(began.elapsed()));
                }
            })
            .map_err(|e| e.to_string())?;
        match wait.recv_timeout(OPEN_TIMEOUT) {
            Ok(Ok(())) => Ok(Arc::new(Self {
                backend,
                window,
                latest,
                stopped,
                focus,
            })),
            Ok(Err(error)) => Err(error),
            Err(_) => {
                stopped.store(true, Ordering::Release);
                Err("Window capture timed out.".into())
            }
        }
    }

    /// The newest frame, only while the window is still the one shared and
    /// the same size as when Preview opened.
    pub fn frame(&self) -> Result<Vec<u8>, String> {
        let now = self.backend.info(self.window.info.id)?;
        if now.info.fingerprint != self.window.info.fingerprint {
            return Err(format!(
                "The application restarted. Select its new window on your {}.",
                host_noun()
            ));
        }
        if (now.width - self.window.width).abs() >= 1.0
            || (now.height - self.window.height).abs() >= 1.0
        {
            return Err(
                "The window resized. Close and reopen Preview to update its layout.".into(),
            );
        }
        let latest = self.latest.lock();
        if let Some(problem) = &latest.problem {
            return Err(problem.clone());
        }
        latest
            .jpeg
            .as_ref()
            .map(|jpeg| jpeg.as_ref().clone())
            .ok_or_else(|| "Waiting for the application's first frame.".into())
    }

    /// Input only against the geometry the phone is looking at. Returns the
    /// keyboard focus afterwards; after a tap, once focus has had a moment to move.
    pub fn input(&self, request: &Value) -> Result<Value, String> {
        let tap_deadline = Instant::now() + super::focus::TAP_WAIT;
        self.frame()?;
        let event = InputEvent::parse(request)?;
        let now = self.backend.info(self.window.info.id)?;
        let tapped = matches!(event, InputEvent::Click { .. });
        let before = tapped.then(|| self.focus.measure(self.backend, &now)["serial"].as_u64());
        match &event {
            // Each action repeats the backend's foreground and focus checks,
            // so keys stop the moment the window loses focus.
            InputEvent::Keys(actions) => {
                for action in actions {
                    match action {
                        Action::Text(units) => {
                            self.backend.input(&now, &InputEvent::Text(units.clone()))?
                        }
                        Action::Key(key, times) => {
                            for _ in 0..*times {
                                self.backend.input(&now, &InputEvent::Key(*key))?;
                            }
                        }
                    }
                }
            }
            other => self.backend.input(&now, other)?,
        }
        let now = self.backend.info(self.window.info.id)?;
        Ok(match before.flatten() {
            Some(serial) => self.focus.settled(self.backend, &now, serial, tap_deadline),
            None => self.focus.current(self.backend, &now),
        })
    }

    /// Keyboard focus in the window, for the phone's own keyboard.
    pub fn focus(&self) -> Result<Value, String> {
        let now = self.backend.info(self.window.info.id)?;
        Ok(self.focus.current(self.backend, &now))
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        self.stop();
    }
}
