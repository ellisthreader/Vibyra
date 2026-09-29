//! Captures one X11 window. With Composite the window keeps its own backing
//! pixmap, so it is captured whole even when other windows cover it; without
//! it the visible pixels are read directly.

use super::conn::{connect, text, X};
use super::inventory::{frame, visible_problem};
use super::pixels::to_bgra;
use super::{Bgra, Geometry, Source};
use x11rb::connection::Connection;
use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
use x11rb::protocol::xproto::{ConnectionExt as _, Drawable, ImageFormat, Window};

pub(super) struct Capture {
    x: X,
    window: Window,
    composite: bool,
}

pub(super) fn open(window: &Geometry) -> Result<Box<dyn Source>, String> {
    // Its own connection: a large image read must not hold up inventory.
    let x = connect()?;
    let id = window.info.id;
    let composite = x
        .conn
        .composite_query_version(0, 4)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .is_some()
        && x.conn
            .composite_redirect_window(id, Redirect::AUTOMATIC)
            .is_ok()
        && x.conn.flush().is_ok();
    Ok(Box::new(Capture {
        x,
        window: id,
        composite,
    }))
}

impl Capture {
    fn read(
        &self,
        drawable: Drawable,
        left: i16,
        top: i16,
        width: u16,
        height: u16,
    ) -> Result<Bgra, String> {
        let image = self
            .x
            .conn
            .get_image(
                ImageFormat::Z_PIXMAP,
                drawable,
                left,
                top,
                width,
                height,
                !0,
            )
            .map_err(text)?
            .reply()
            .map_err(text)?;
        to_bgra(
            self.x.conn.setup(),
            image.depth,
            &image.data,
            width.into(),
            height.into(),
        )
    }
}

impl Source for Capture {
    fn grab(&mut self) -> Result<Option<Bgra>, String> {
        visible_problem(&self.x, self.window)?;
        let geometry = self
            .x
            .conn
            .get_geometry(self.window)
            .map_err(text)?
            .reply()
            .map_err(text)?;
        let (left, top, width, height) = frame(&self.x, self.window)?;
        let origin = self
            .x
            .conn
            .translate_coordinates(self.window, self.x.root, 0, 0)
            .map_err(text)?
            .reply()
            .map_err(text)?;
        // The frame inside the window, skipping a client-side shadow.
        let inset_x = (left - f64::from(origin.dst_x)).max(0.0) as i16;
        let inset_y = (top - f64::from(origin.dst_y)).max(0.0) as i16;
        let (width, height) = (
            (width as u16).min(geometry.width),
            (height as u16).min(geometry.height),
        );
        if self.composite {
            let pixmap = self.x.conn.generate_id().map_err(text)?;
            let named = self
                .x
                .conn
                .composite_name_window_pixmap(self.window, pixmap);
            if named.is_ok() {
                let frame = self.read(pixmap, inset_x, inset_y, width, height);
                let _ = self.x.conn.free_pixmap(pixmap);
                if let Ok(frame) = frame {
                    return Ok(Some(frame));
                }
            }
            self.composite = false;
        }
        self.read(self.window, inset_x, inset_y, width, height)
            .map(Some)
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        if self.composite {
            let _ = self
                .x
                .conn
                .composite_unredirect_window(self.window, Redirect::AUTOMATIC);
            let _ = self.x.conn.flush();
        }
    }
}
