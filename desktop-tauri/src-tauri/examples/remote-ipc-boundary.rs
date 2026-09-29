//! Native adversarial fixture. Inert commands share production command names and ACL.
//! No AppState, account, keychain, host, relay, or installed app is opened.
use serde_json::Value;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
#[path = "../src/native_logging.rs"]
mod native_logging;

static MUTATIONS: AtomicUsize = AtomicUsize::new(0);
static ROOT_SAFE: AtomicBool = AtomicBool::new(false);
static LOCAL_DENIED: AtomicBool = AtomicBool::new(false);
static REMOTE_DENIED: AtomicBool = AtomicBool::new(false);

struct Origin(String);

#[tauri::command]
fn remote_security_snapshot() -> bool {
    true
}

#[tauri::command]
fn remote_security_decide_device() {
    MUTATIONS.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
fn remote_security_disable_all(
    app: tauri::AppHandle,
    origin: tauri::State<'_, Origin>,
    report: Value,
) {
    let safe = report["rootAllowed"] == true
        && report["childInvokePresent"] == false
        && report["parentReadable"] == false
        && report["childInvokeSucceeded"] != true
        && report["guessedMessageSent"] == true
        && MUTATIONS.load(Ordering::SeqCst) == 0;
    // Never print native invoke keys or arbitrary frame text.
    println!(
        "IPC_BOUNDARY {} root={} child_api={} parent_access={} native_mutations={}",
        if safe { "PASS" } else { "FAIL" },
        report["rootAllowed"],
        report["childInvokePresent"],
        report["parentReadable"],
        MUTATIONS.load(Ordering::SeqCst)
    );
    if !safe {
        app.exit(1);
        return;
    }
    ROOT_SAFE.store(true, Ordering::SeqCst);
    // The same main label must lose native command authority on remote navigation.
    app.get_webview_window("main")
        .unwrap()
        .navigate(format!("{}/top", origin.0).parse().unwrap())
        .unwrap();
}

fn main() {
    native_logging::install();
    let server = TcpListener::bind("127.0.0.1:0").expect("Bind fixture loopback server");
    let origin = format!("http://{}", server.local_addr().unwrap());
    std::thread::spawn(move || {
        for mut stream in server.incoming().flatten() {
            let mut request = [0_u8; 4096];
            let size = stream.read(&mut request).unwrap_or_default();
            let request = String::from_utf8_lossy(&request[..size]);
            let path = request.split_whitespace().nth(1).unwrap_or_default();
            let body = match path {
                "/result?kind=local&denied=true" => {
                    LOCAL_DENIED.store(true, Ordering::SeqCst);
                    "ok"
                }
                "/result?kind=remote&denied=true" => {
                    REMOTE_DENIED.store(true, Ordering::SeqCst);
                    "ok"
                }
                "/top" => include_str!("ipc-boundary/assets/unprivileged.html"),
                "/unprivileged.js" => include_str!("ipc-boundary/assets/unprivileged.js"),
                _ => include_str!("ipc-boundary/attack.html"),
            };
            let content_type = if path.ends_with(".js") {
                "application/javascript"
            } else {
                "text/html"
            };
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            let _ = stream.write_all(response.as_bytes());
        }
    });
    tauri::Builder::default()
        .manage(Origin(origin.clone()))
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "project-fixture", WebviewUrl::App("unprivileged.html".into()))
                .visible(false).initialization_script(format!("window.fixtureOrigin = {origin:?};")).build()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Vibyra IPC Boundary Fixture").inner_size(640.0, 400.0)
                .initialization_script(format!("window.fixtureOrigin = {origin:?};"))
                .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..250 {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    if ROOT_SAFE.load(Ordering::SeqCst) && LOCAL_DENIED.load(Ordering::SeqCst) && REMOTE_DENIED.load(Ordering::SeqCst) {
                        let mutations = MUTATIONS.load(Ordering::SeqCst);
                        println!("IPC_ACL {} local_webview_denied=true remote_main_denied=true native_mutations={mutations}", if mutations == 0 { "PASS" } else { "FAIL" });
                        handle.exit(if mutations == 0 { 0 } else { 1 }); return;
                    }
                }
                println!("IPC_ACL TIMEOUT local_denied={} remote_denied={}", LOCAL_DENIED.load(Ordering::SeqCst), REMOTE_DENIED.load(Ordering::SeqCst));
                handle.exit(2);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![remote_security_snapshot, remote_security_decide_device, remote_security_disable_all])
        .run(tauri::generate_context!("examples/ipc-boundary/tauri.conf.json"))
        .expect("Run isolated native IPC boundary test");
}
