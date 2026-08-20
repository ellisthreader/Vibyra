//! Standalone probe for the X11 capture path used by capture_screen.
use x11rb::connection::Connection;
use x11rb::protocol::randr::ConnectionExt as _;
use x11rb::protocol::xproto::{ConnectionExt as _, ImageFormat};

fn main() {
    let (conn, screen_num) = match x11rb::connect(None) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("connect failed: {e}");
            std::process::exit(1);
        }
    };
    let screen = &conn.setup().roots[screen_num];
    let root = screen.root;
    println!(
        "screen {}x{} depth {}",
        screen.width_in_pixels, screen.height_in_pixels, screen.root_depth
    );

    match conn.randr_get_monitors(root, true).map(|c| c.reply()) {
        Ok(Ok(reply)) => {
            for m in &reply.monitors {
                println!(
                    "monitor primary={} {}x{}+{}+{}",
                    m.primary, m.width, m.height, m.x, m.y
                );
            }
        }
        other => println!("randr monitors failed: {other:?}"),
    }

    let (w, h) = (screen.width_in_pixels, screen.height_in_pixels);
    match conn
        .get_image(ImageFormat::Z_PIXMAP, root, 0, 0, w, h, !0)
        .map(|c| c.reply())
    {
        Ok(Ok(reply)) => println!(
            "get_image OK: depth={} bytes={}",
            reply.depth,
            reply.data.len()
        ),
        Ok(Err(e)) => println!("get_image reply error: {e}"),
        Err(e) => println!("get_image request error: {e}"),
    }
}
