// The stream's Preview notifications use the same bounded watcher as Desktop.
#[allow(unused_imports)]
#[path = "../../src/phone/preview_service/discovery.rs"]
mod discovery;
#[path = "../../src/phone/preview_service/watch.rs"]
pub mod watch;

// These chat/typing probes do not include the native window adapter.
mod native_discovery {
    pub(super) fn signature() -> Vec<String> {
        Vec::new()
    }
}

// Nor do they look for local sites: the watcher and discovery see none.
#[allow(dead_code)]
mod discovery_system {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::time::Duration;

    pub(super) struct Listener {
        pub pid: u32,
        pub port: u16,
        pub ipv6: bool,
    }
    pub(super) fn listeners(_: Duration) -> Option<Vec<Listener>> {
        None
    }
    pub(super) fn cwds(_: &[u32]) -> HashMap<u32, PathBuf> {
        HashMap::new()
    }
    pub(super) fn started(_: &[u32]) -> HashMap<u32, i64> {
        HashMap::new()
    }
}
