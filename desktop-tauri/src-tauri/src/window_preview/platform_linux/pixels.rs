//! X11 image bytes to the capture core's BGRA, for the formats real X servers
//! (and XWayland) use.

use super::Bgra;
use x11rb::protocol::xproto::{ImageOrder, Setup};

pub(super) fn to_bgra(
    setup: &Setup,
    depth: u8,
    data: &[u8],
    width: u32,
    height: u32,
) -> Result<Bgra, String> {
    let bits = setup
        .pixmap_formats
        .iter()
        .find(|format| format.depth == depth)
        .map(|format| (format.bits_per_pixel, format.scanline_pad))
        .ok_or("Unknown window pixel format")?;
    let pad = u32::from(bits.1.max(8));
    let row_bits = width * u32::from(bits.0);
    let stride = (row_bits.div_ceil(pad) * pad / 8) as usize;
    if data.len() < stride * height as usize {
        return Err("Window capture returned a short frame.".into());
    }
    let most_first = setup.image_byte_order == ImageOrder::MSB_FIRST;
    let mut out = Vec::with_capacity(width as usize * height as usize * 4);
    for row in data.chunks(stride).take(height as usize) {
        match (bits.0, depth) {
            (32, 24 | 32) => {
                for pixel in row[..width as usize * 4].chunks_exact(4) {
                    if most_first {
                        out.extend_from_slice(&[pixel[3], pixel[2], pixel[1], 255]);
                    } else {
                        out.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
                    }
                }
            }
            (16, 16) => {
                for pixel in row[..width as usize * 2].chunks_exact(2) {
                    let value = if most_first {
                        u16::from_be_bytes([pixel[0], pixel[1]])
                    } else {
                        u16::from_le_bytes([pixel[0], pixel[1]])
                    };
                    let expand =
                        |v: u16, bits: u32| ((u32::from(v) * 255) / ((1 << bits) - 1)) as u8;
                    out.extend_from_slice(&[
                        expand(value & 0x1f, 5),
                        expand((value >> 5) & 0x3f, 6),
                        expand(value >> 11, 5),
                        255,
                    ]);
                }
            }
            _ => {
                return Err(format!(
                    "Windows with {depth}-bit colour cannot be previewed yet."
                ))
            }
        }
    }
    Ok(Bgra {
        width,
        height,
        stride: width as usize * 4,
        data: out,
    })
}
