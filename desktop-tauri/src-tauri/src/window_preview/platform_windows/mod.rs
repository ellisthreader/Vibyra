//! Windows window Preview: EnumWindows inventory, Windows.Graphics.Capture
//! with a PrintWindow fallback, and SendInput behind foreground, focus and
//! integrity checks. Loaded by `native` as its `os` backend.
mod automation;
mod desktop;
mod effects;
mod focus;
mod identity;
mod input;
mod input_target;
mod inventory;
mod print;
#[cfg(test)]
mod tests;
mod text_fields;
mod wgc;

use super::{Backend, Bgra, Field, Focused, Geometry, InputEvent, Source};
use std::time::{Duration, Instant};

struct WindowsBackend;

pub(super) fn backend() -> &'static dyn Backend {
    static BACKEND: WindowsBackend = WindowsBackend;
    &BACKEND
}

impl Backend for WindowsBackend {
    fn inventory(&self) -> Result<Vec<Geometry>, String> {
        desktop::unlocked()?;
        inventory::list()
    }
    fn info(&self, id: u32) -> Result<Geometry, String> {
        desktop::unlocked()?;
        inventory::info(id)
    }
    fn open(&self, window: &Geometry) -> Result<Box<dyn Source>, String> {
        inventory::dpi_aware();
        inventory::capturable(window.info.id)?;
        let wgc = wgc::Wgc::open(window).ok();
        Ok(Box::new(Adaptive {
            id: window.info.id,
            wgc,
            print: print::Print::new(window.info.id),
            opened: Instant::now(),
            framed: false,
        }))
    }
    fn input(&self, window: &Geometry, event: &InputEvent) -> Result<(), String> {
        input::send(window, event)
    }
    fn input_checked(
        &self,
        window: &Geometry,
        event: &InputEvent,
        check: &crate::window_preview::InputCheck<'_>,
    ) -> Result<(), String> {
        input::send_checked(window, event, check)
    }
    fn focus(&self, window: &Geometry) -> Result<Focused, String> {
        focus::focused(window)
    }
    fn fields(&self, window: &Geometry) -> Vec<Field> {
        text_fields::fields(window)
    }
}

/// Windows.Graphics.Capture when it works; PrintWindow when it is missing,
/// fails, or shows nothing for two seconds (as in some GPU-less VMs).
struct Adaptive {
    id: u32,
    wgc: Option<wgc::Wgc>,
    print: print::Print,
    opened: Instant,
    framed: bool,
}

impl Source for Adaptive {
    fn grab(&mut self) -> Result<Option<Bgra>, String> {
        inventory::visible_problem(self.id)?;
        if let Some(wgc) = &mut self.wgc {
            match wgc.grab() {
                Ok(Some(frame)) => {
                    self.framed = true;
                    return Ok(Some(frame));
                }
                Ok(None) if self.framed || self.opened.elapsed() < Duration::from_secs(2) => {
                    return Ok(None);
                }
                _ => self.wgc = None,
            }
        }
        self.print.grab()
    }
}
