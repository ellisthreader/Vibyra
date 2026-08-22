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

#[test]
fn file_uri_percent_encodes_but_keeps_drive_letters_readable() {
    use std::path::Path;

    use super::screenshot_reveal::file_uri;

    assert_eq!(
        file_uri(Path::new("/home/a b/shot #1.png")),
        "file:///home/a%20b/shot%20%231.png"
    );
    assert_eq!(
        file_uri(Path::new(r"C:\Users\a\shot.png")),
        "file:///C:/Users/a/shot.png"
    );
}

#[test]
fn saved_paths_outside_the_screenshot_folder_are_refused() {
    use super::screenshot::saved_screenshot_path;

    let root = std::env::temp_dir().join("vibyra-screenshot-guard");
    let inside = root.join("shot.png");
    let outside = std::env::temp_dir().join("vibyra-elsewhere.png");
    std::fs::create_dir_all(&root).expect("temp dir");
    std::fs::write(&inside, b"x").expect("temp file");
    std::fs::write(&outside, b"x").expect("temp file");

    assert!(saved_screenshot_path(&root, &inside.to_string_lossy()).is_ok());
    let error = saved_screenshot_path(&root, &outside.to_string_lossy())
        .expect_err("outside the screenshot folder");
    assert!(error.contains("outside"));
    assert!(saved_screenshot_path(&root, &root.join("missing.png").to_string_lossy()).is_err());
}
