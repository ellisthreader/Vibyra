//! Helpers the Agent browser tests share: run script as the page would, and
//! wait for something the page does on its own.

use super::super::session::Session;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// Evaluates `script` in the page's own (main) world, the way the site's code runs.
pub fn page_js(s: &Session, script: &str) -> Value {
    let out = s
        .cdp
        .call(
            "Runtime.evaluate",
            json!({"expression": script, "returnByValue": true, "awaitPromise": true}),
            Some(&s.page),
        )
        .unwrap();
    assert!(
        out.get("exceptionDetails").is_none(),
        "{script} threw: {out}"
    );
    out["result"]["value"].clone()
}

/// Polls `check` until it returns something (up to `limit`).
pub fn wait_for<T>(limit: Duration, mut check: impl FnMut() -> Option<T>) -> Option<T> {
    let started = Instant::now();
    loop {
        if let Some(found) = check() {
            return Some(found);
        }
        if started.elapsed() > limit {
            return None;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// The page's `document.title`, which the test pages use to report what happened.
pub fn title(s: &Session) -> String {
    page_js(s, "document.title")
        .as_str()
        .unwrap_or_default()
        .to_owned()
}
