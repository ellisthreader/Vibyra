use super::focus::{Field, Focused};
use super::input::InputEvent;
use crate::window_preview::WindowInfo;
use serde::Serialize;

/// A window as every platform reports it: identity plus its frame on the
/// desktop, in the coordinates its input backend uses.
#[derive(Clone, Debug, Serialize)]
pub(crate) struct Geometry {
    #[serde(flatten)]
    pub info: WindowInfo,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// One captured frame, blue-green-red-unused, `stride` bytes per row.
pub(crate) struct Bgra {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub data: Vec<u8>,
}

/// A live capture of one window, created and used on its capture thread.
pub(crate) trait Source {
    /// The newest frame, or None when nothing changed since the last one.
    fn grab(&mut self) -> Result<Option<Bgra>, String>;
}

pub(crate) trait Backend: Send + Sync {
    /// Why this computer cannot capture windows at all, if it cannot.
    fn available(&self) -> Result<(), String> {
        Ok(())
    }
    /// Visible application windows, at most 256.
    fn inventory(&self) -> Result<Vec<Geometry>, String>;
    fn info(&self, id: u32) -> Result<Geometry, String>;
    fn open(&self, window: &Geometry) -> Result<Box<dyn Source>, String>;
    fn input(&self, window: &Geometry, event: &InputEvent) -> Result<(), String>;
    fn input_checked(
        &self,
        window: &Geometry,
        event: &InputEvent,
        check: &crate::window_preview::InputCheck<'_>,
    ) -> Result<(), String> {
        check()?;
        self.input(window, event)
    }
    /// What has keyboard focus in the window, for the phone's own keyboard.
    /// Platforms that cannot tell report no field; the phone keeps its
    /// keyboard button either way.
    fn focus(&self, _window: &Geometry) -> Result<Focused, String> {
        Ok(Focused::default())
    }
    /// The window's visible text fields, at most 48; may be slow.
    fn fields(&self, _window: &Geometry) -> Vec<Field> {
        Vec::new()
    }
}
