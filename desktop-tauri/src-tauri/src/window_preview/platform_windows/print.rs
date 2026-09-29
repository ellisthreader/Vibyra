//! PrintWindow fallback for PCs where Windows.Graphics.Capture is missing or
//! shows nothing. Asks the window to draw itself, including GPU content.

use super::inventory::{bounds, hwnd};
use super::Bgra;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

/// PW_RENDERFULLCONTENT: include DirectX and browser content.
const FULL_CONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

pub(super) struct Print {
    id: u32,
}

impl Print {
    pub fn new(id: u32) -> Self {
        Self { id }
    }

    pub fn grab(&mut self) -> Result<Option<Bgra>, String> {
        let handle = hwnd(self.id);
        let mut outer = RECT::default();
        // SAFETY: fills one RECT.
        unsafe { GetWindowRect(handle, &mut outer) }.map_err(|e| e.message())?;
        let frame = bounds(handle, false).unwrap_or(outer);
        let (width, height) = (outer.right - outer.left, outer.bottom - outer.top);
        if width <= 0 || height <= 0 {
            return Err("The window has no visible content.".into());
        }
        let mut data = vec![0u8; width as usize * height as usize * 4];
        // SAFETY: every GDI object created here is selected out and deleted
        // before returning; GetDIBits writes at most `data`'s length.
        let copied = unsafe {
            let screen = GetDC(None);
            let memory = CreateCompatibleDC(Some(screen));
            let bitmap = CreateCompatibleBitmap(screen, width, height);
            let previous = SelectObject(memory, bitmap.into());
            let printed = PrintWindow(handle, memory, FULL_CONTENT).as_bool();
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let rows = GetDIBits(
                memory,
                bitmap,
                0,
                height as u32,
                Some(data.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(memory, previous);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(memory);
            ReleaseDC(None, screen);
            printed && rows == height
        };
        if !copied {
            return Err("Windows could not draw this window for capture.".into());
        }
        // Keep the visible frame; drop the invisible resize border and shadow.
        let (left, top) = (
            (frame.left - outer.left).max(0),
            (frame.top - outer.top).max(0),
        );
        let crop_w = (frame.right - frame.left).clamp(1, width - left);
        let crop_h = (frame.bottom - frame.top).clamp(1, height - top);
        let stride = width as usize * 4;
        let mut cropped = Vec::with_capacity(crop_w as usize * crop_h as usize * 4);
        for row in top..top + crop_h {
            let start = row as usize * stride + left as usize * 4;
            cropped.extend_from_slice(&data[start..start + crop_w as usize * 4]);
        }
        Ok(Some(Bgra {
            width: crop_w as u32,
            height: crop_h as u32,
            stride: crop_w as usize * 4,
            data: cropped,
        }))
    }
}
