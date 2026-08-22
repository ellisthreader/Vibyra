//! PNG decode/encode for the screenshot commands, with the hard limits that
//! keep a hostile or corrupt data URL from allocating the process to death.

use std::io::Cursor;

use base64::Engine;
use image::{DynamicImage, ImageReader, Limits};

pub(super) const PNG_PREFIX: &str = "data:image/png;base64,";
const MAX_PNG_BYTES: usize = 32 * 1024 * 1024;
const MAX_PNG_BASE64_BYTES: usize = MAX_PNG_BYTES.div_ceil(3) * 4;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 50_000_000;
const MAX_DECODE_ALLOC_BYTES: u64 = 256 * 1024 * 1024;

/// The same ceilings `decode_png_bytes` enforces, for pixels that arrive as a
/// raw buffer instead of an encoded PNG.
pub(super) fn check_image_size(width: u32, height: u32) -> Result<(), String> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 {
        return Err("The image is empty.".to_string());
    }
    if width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || pixels > MAX_IMAGE_PIXELS {
        return Err("The image dimensions are too large.".to_string());
    }
    Ok(())
}

pub(super) fn png_bytes(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(output.into_inner())
}

pub(crate) fn decode_png(data_url: &str) -> Result<(Vec<u8>, DynamicImage), String> {
    let encoded = data_url
        .strip_prefix(PNG_PREFIX)
        .ok_or_else(|| "The screenshot is not a PNG data URL.".to_string())?;
    if encoded.len() > MAX_PNG_BASE64_BYTES {
        return Err("The screenshot is too large.".to_string());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "The screenshot PNG is invalid.".to_string())?;
    if bytes.len() > MAX_PNG_BYTES {
        return Err("The screenshot is too large.".to_string());
    }
    let image = decode_png_bytes(&bytes)?;
    Ok((bytes, image))
}

pub(super) fn decode_png_bytes(bytes: &[u8]) -> Result<DynamicImage, String> {
    if bytes.len() > MAX_PNG_BYTES {
        return Err("The screenshot is too large.".to_string());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC_BYTES);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), image::ImageFormat::Png);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "The screenshot PNG could not be decoded.".to_string())?;
    let pixels = u64::from(image.width()) * u64::from(image.height());
    if pixels > MAX_IMAGE_PIXELS {
        return Err("The screenshot dimensions are too large.".to_string());
    }
    Ok(image)
}
