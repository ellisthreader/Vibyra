//! Linux window Preview over X11. Apps Vibyra starts run on X11 (XWayland on
//! a Wayland desktop), so no window picker is needed on the computer. Loaded by
//! `native` as its `os` backend.
mod atspi;
mod atspi_codes;
mod capture;
mod conn;
mod focus;
mod front;
mod input;
mod inventory;
mod lock;
mod pixels;
#[cfg(test)]
mod tests;

use super::{Backend, Bgra, Field, Focused, Geometry, InputEvent, Source};

struct LinuxBackend;

pub(super) fn backend() -> &'static dyn Backend {
    static BACKEND: LinuxBackend = LinuxBackend;
    &BACKEND
}

impl Backend for LinuxBackend {
    fn available(&self) -> Result<(), String> {
        conn::with(|_| Ok(()))
    }
    fn inventory(&self) -> Result<Vec<Geometry>, String> {
        lock::unlocked()?;
        conn::with(inventory::list)
    }
    fn info(&self, id: u32) -> Result<Geometry, String> {
        lock::unlocked()?;
        conn::with(|x| inventory::info(x, id))
    }
    fn open(&self, window: &Geometry) -> Result<Box<dyn Source>, String> {
        capture::open(window)
    }
    fn input(&self, window: &Geometry, event: &InputEvent) -> Result<(), String> {
        lock::unlocked()?;
        conn::with(|x| input::send(x, window, event))
    }
    fn focus(&self, window: &Geometry) -> Result<Focused, String> {
        lock::unlocked()?;
        let id = window.info.id;
        let front = conn::with(|x| Ok(x.property32(x.root, x.atoms.active).first() == Some(&id)))?;
        Ok(focus::focused(window, front))
    }
    fn fields(&self, window: &Geometry) -> Vec<Field> {
        focus::fields(window)
    }
}
