use base64::Engine;
use image::DynamicImage;

use super::screenshot_png::decode_png;

fn png_data_url(image: &DynamicImage) -> String {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, image::ImageFormat::Png)
        .expect("encode fixture");
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes.into_inner())
    )
}

#[test]
fn screenshot_decoder_accepts_a_small_png() {
    let image = DynamicImage::new_rgba8(2, 3);
    let (_, decoded) = decode_png(&png_data_url(&image)).expect("valid screenshot");
    assert_eq!((decoded.width(), decoded.height()), (2, 3));
}

#[test]
fn screenshot_decoder_rejects_wrong_media_type() {
    let error = decode_png("data:image/jpeg;base64,AAAA").expect_err("wrong media type");
    assert!(error.contains("not a PNG data URL"));
}

#[test]
fn screenshot_decoder_rejects_oversized_dimensions() {
    let image = DynamicImage::new_rgba8(16_385, 1);
    let error = decode_png(&png_data_url(&image)).expect_err("oversized screenshot");
    assert!(error.contains("could not be decoded"));
}
