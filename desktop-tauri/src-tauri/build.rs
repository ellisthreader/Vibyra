mod build_window_preview;
fn main() {
    build_window_preview::build();
    tauri_build::build()
}
