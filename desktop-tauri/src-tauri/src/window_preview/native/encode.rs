//! Frames go to the phone as JPEG no larger than 1280 pixels on the long side
//! and 2 MiB, like the Mac adapter's.

use super::backend::Bgra;
use image::codecs::jpeg::JpegEncoder;
use image::ExtendedColorType;

const LONGEST: u32 = 1280;
const MAX_BYTES: usize = 2 * 1024 * 1024;

pub(super) fn jpeg(frame: &Bgra) -> Result<Vec<u8>, String> {
    let (width, height) = (frame.width, frame.height);
    if width == 0 || height == 0 || frame.stride < width as usize * 4 {
        return Err("The window has no visible content.".into());
    }
    if frame.data.len() < frame.stride * (height as usize - 1) + width as usize * 4 {
        return Err("Window capture returned a short frame.".into());
    }
    let scale = (LONGEST as f64 / width.max(height) as f64).min(1.0);
    let out_w = ((width as f64 * scale).round() as u32).max(1);
    let out_h = ((height as f64 * scale).round() as u32).max(1);
    let rgb = downscale(frame, out_w, out_h);
    for quality in [70, 50] {
        let mut bytes = Vec::new();
        JpegEncoder::new_with_quality(&mut bytes, quality)
            .encode(&rgb, out_w, out_h, ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
        if bytes.len() <= MAX_BYTES {
            return Ok(bytes);
        }
    }
    Err("The window is too detailed to stream right now.".into())
}

/// Averages each block of source pixels into one, so text stays legible.
fn downscale(frame: &Bgra, out_w: u32, out_h: u32) -> Vec<u8> {
    let (width, height) = (frame.width as usize, frame.height as usize);
    let (out_w, out_h) = (out_w as usize, out_h as usize);
    let mut rgb = Vec::with_capacity(out_w * out_h * 3);
    for ty in 0..out_h {
        let (y0, y1) = (
            ty * height / out_h,
            ((ty + 1) * height / out_h).max(ty * height / out_h + 1),
        );
        for tx in 0..out_w {
            let (x0, x1) = (
                tx * width / out_w,
                ((tx + 1) * width / out_w).max(tx * width / out_w + 1),
            );
            let (mut sum, mut count) = ([0u32; 3], 0u32);
            for y in y0..y1.min(height) {
                let row = &frame.data[y * frame.stride..];
                for x in x0..x1.min(width) {
                    let pixel = &row[x * 4..x * 4 + 3];
                    sum[0] += u32::from(pixel[2]);
                    sum[1] += u32::from(pixel[1]);
                    sum[2] += u32::from(pixel[0]);
                    count += 1;
                }
            }
            let count = count.max(1);
            rgb.extend(sum.iter().map(|channel| (channel / count) as u8));
        }
    }
    rgb
}
