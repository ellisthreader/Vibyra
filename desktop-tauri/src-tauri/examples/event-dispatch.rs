//! Inert native regression: no production AppState, credentials or owner workspace.
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[path = "../src/native_logging.rs"]
mod native_logging;
static CALLBACK_DELIVERED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn remote_security_snapshot(app: tauri::AppHandle, phase: String) -> bool {
    // This synchronous command deliberately occupies the main thread. A
    // producer must enqueue delivery without waiting for this thread to return.
    let window = app.get_webview_window("main").expect("Fixture window");
    let (done, result) = mpsc::channel();
    std::thread::spawn(move || {
        let sent = match phase.as_str() {
            "emit" => app.emit("fixture:dispatch", "harmless fixture payload"),
            "eval" => window.eval("window.fixtureEvalDelivered = true"),
            "callback" => window.eval_with_callback("6 * 7", |value| {
                CALLBACK_DELIVERED.store(value == "42", Ordering::SeqCst);
            }),
            _ => unreachable!("Fixed fixture phases only"),
        };
        let _ = done.send(sent.is_ok());
    });
    result.recv_timeout(Duration::from_secs(2)).unwrap_or(false)
}

#[tauri::command]
fn remote_security_disable_all(app: tauri::AppHandle, nonblocking: Vec<bool>, delivered: bool) {
    let callback = CALLBACK_DELIVERED.load(Ordering::SeqCst);
    let safe = nonblocking == [true, true, true] && delivered && callback;
    println!(
        "EVENT_DISPATCH {} nonblocking={nonblocking:?} delivered={delivered} callback={callback}",
        if safe { "PASS" } else { "FAIL" }
    );
    app.exit(if safe { 0 } else { 1 });
}

fn main() {
    native_logging::install();
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Vibyra Event Dispatch Fixture")
                .visible(false)
                .build()?;
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(15));
                println!("EVENT_DISPATCH TIMEOUT");
                std::process::exit(2);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            remote_security_snapshot,
            remote_security_disable_all
        ])
        .run(tauri::generate_context!(
            "examples/event-dispatch/tauri.conf.json"
        ))
        .expect("Run isolated native event dispatch regression");
}
