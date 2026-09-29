//! Framework IPC diagnostics may contain invoke keys/payloads; never format them.
use tracing::{Level, Metadata, Subscriber};
use tracing_subscriber::{filter::filter_fn, fmt::MakeWriter, layer::SubscriberExt, Layer};

pub fn install() {
    // Deliberately ignore RUST_LOG. Even release error-level Tauri IPC diagnostics
    // can carry secrets; an environment override must not re-enable them.
    tracing::subscriber::set_global_default(subscriber(std::io::stderr))
        .expect("Install fixed native diagnostic policy before creating webviews");
}

fn permitted(metadata: &Metadata<'_>) -> bool {
    // Allow only application warning/error events. Other dependencies (including
    // tauri, wry, and network libraries) can emit request or IPC contents.
    metadata.is_event()
        && *metadata.level() <= Level::WARN
        && (metadata.target() == "vibyra_desktop_lib"
            || metadata.target().starts_with("vibyra_desktop_lib::"))
}

fn subscriber<W>(writer: W) -> impl Subscriber + Send + Sync
where
    W: for<'a> MakeWriter<'a> + Send + Sync + 'static,
{
    tracing_subscriber::registry().with(
        tracing_subscriber::fmt::layer()
            .without_time()
            .with_ansi(false)
            .with_writer(writer)
            .with_filter(filter_fn(permitted)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    #[derive(Clone)]
    struct Capture(Arc<Mutex<Vec<u8>>>);
    impl Write for Capture {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl<'a> MakeWriter<'a> for Capture {
        type Writer = Self;
        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    #[test]
    fn framework_key_and_payload_diagnostics_never_reach_writer() {
        let output = Capture(Arc::new(Mutex::new(Vec::new())));
        tracing::subscriber::with_default(subscriber(output.clone()), || {
            tracing::error!(target: "tauri::webview", "__TAURI_INVOKE_KEY__ expected fixture-secret");
            tracing::error!(target: "tauri::ipc", body = "fixture-payload", "rejected invoke");
            tracing::warn!(target: "tauri_runtime_wry", "fixture-native-secret");
            tracing::error!(target: "wry", "fixture-window-secret");
            tracing::error!(target: "reqwest", "fixture-header-secret");
            tracing::debug!(target: "vibyra_desktop_lib::remote", "fixture-verbose-content");
            tracing::warn!(target: "vibyra_desktop_lib::remote", "Remote control unavailable");
        });
        let bytes = output.0.lock().unwrap();
        let rendered = std::str::from_utf8(&bytes).unwrap();
        assert!(rendered.contains("Remote control unavailable"));
        assert!(!rendered.contains("fixture-"));
        assert!(!rendered.contains("TAURI_INVOKE_KEY"));
    }
}
